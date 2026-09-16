use super::{
    ApplicationError, Clock, InMemoryOrderRepository, OrderApplication, OrderSearch, Principal,
    UpdateOrder, UpsertOrder, UserId,
};
use crate::models::{Order, OrderStatus};

fn order(id: &str, user_id: &str, order_number: &str) -> Order {
    Order {
        id: id.to_string(),
        user_id: user_id.to_string(),
        order_number: order_number.to_string(),
        product_name: "Test product".to_string(),
        order_date: "August 26, 2026".to_string(),
        product_image: "https://example.com/product.jpg".to_string(),
        price: "$10.00".to_string(),
        status: OrderStatus::Uncommented,
        note: None,
        updated_at: Some("2026-08-26T12:00:00Z".to_string()),
        created_at: Some("2026-08-26T12:00:00Z".to_string()),
        deleted_at: None,
    }
}

fn upsert_order(id: &str, order_number: &str) -> UpsertOrder {
    UpsertOrder {
        id: id.to_string(),
        order_number: order_number.to_string(),
        product_name: "Test product".to_string(),
        order_date: "August 26, 2026".to_string(),
        product_image: "https://example.com/product.jpg".to_string(),
        price: "$10.00".to_string(),
        status: OrderStatus::Uncommented,
        note: None,
        updated_at: Some("2026-08-26T13:00:00Z".to_string()),
        created_at: Some("2026-08-26T13:00:00Z".to_string()),
        deleted_at: None,
    }
}

struct FixedClock(&'static str);

impl Clock for FixedClock {
    fn now_utc(&self) -> String {
        self.0.to_string()
    }
}

#[tokio::test]
async fn list_orders_returns_only_the_authenticated_users_orders() {
    let repository = InMemoryOrderRepository::with_orders([
        order("alice-order", "alice", "111-1111111-1111111"),
        order("bob-order", "bob", "222-2222222-2222222"),
    ]);
    let application = OrderApplication::new(repository);
    let principal = Principal::extension(UserId::new("alice"));

    let orders = application.list_orders(&principal).await.unwrap();

    assert_eq!(orders.len(), 1);
    assert_eq!(orders[0].id, "alice-order");
}

#[tokio::test]
async fn get_order_does_not_reveal_another_users_colliding_id() {
    let repository = InMemoryOrderRepository::with_orders([
        order("shared-id", "alice", "111-1111111-1111111"),
        order("shared-id", "bob", "222-2222222-2222222"),
    ]);
    let application = OrderApplication::new(repository);
    let principal = Principal::extension(UserId::new("carol"));

    let result = application.get_order(&principal, "shared-id").await;

    assert!(matches!(result, Err(ApplicationError::NotFound)));
}

#[tokio::test]
async fn agent_principal_cannot_upsert_even_via_the_application_interface() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([order(
        "existing",
        "alice",
        "111-1111111-1111111",
    )]));
    let principal = Principal::agent(UserId::new("alice"));

    let result = application
        .upsert_order(&principal, upsert_order("forbidden", "222-2222222-2222222"))
        .await;

    assert!(matches!(result, Err(ApplicationError::Forbidden)));
    let orders = application.list_orders(&principal).await.unwrap();
    assert_eq!(orders.len(), 1);
    assert_eq!(orders[0].id, "existing");
}

#[tokio::test]
async fn stale_extension_upsert_returns_the_newer_cloud_order_without_overwriting_it() {
    let mut cloud_order = order("cloud", "alice", "111-1111111-1111111");
    cloud_order.product_name = "Newer cloud product".to_string();
    cloud_order.updated_at = Some("2026-08-26T14:00:00Z".to_string());
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([cloud_order]));
    let principal = Principal::extension(UserId::new("alice"));
    let mut stale_upload = upsert_order("local", "111-1111111-1111111");
    stale_upload.product_name = "Stale local product".to_string();
    stale_upload.updated_at = Some("2026-08-26T13:00:00Z".to_string());

    let canonical = application
        .upsert_order(&principal, stale_upload)
        .await
        .unwrap();

    assert_eq!(canonical.id, "cloud");
    assert_eq!(canonical.product_name, "Newer cloud product");
    let orders = application.list_orders(&principal).await.unwrap();
    assert_eq!(orders[0].id, "cloud");
    assert_eq!(orders[0].product_name, "Newer cloud product");
}

#[tokio::test]
async fn agent_status_update_is_tenant_scoped_and_uses_the_server_clock() {
    let application = OrderApplication::with_clock(
        InMemoryOrderRepository::with_orders([
            order("shared-id", "alice", "111-1111111-1111111"),
            order("shared-id", "bob", "222-2222222-2222222"),
        ]),
        FixedClock("2026-08-26T16:30:00Z"),
    );

    let updated = application
        .update_status(
            &Principal::agent(UserId::new("alice")),
            "shared-id",
            OrderStatus::Reimbursed,
            "2026-08-26T12:00:00Z".into(),
        )
        .await
        .unwrap();

    assert_eq!(updated.status, OrderStatus::Reimbursed);
    assert_eq!(updated.updated_at.as_deref(), Some("2026-08-26T16:30:00Z"));
    let bob_order = application
        .get_order(&Principal::agent(UserId::new("bob")), "shared-id")
        .await
        .unwrap();
    assert_eq!(bob_order.status, OrderStatus::Uncommented);
}

#[tokio::test]
async fn agent_note_update_uses_the_server_clock() {
    let application = OrderApplication::with_clock(
        InMemoryOrderRepository::with_orders([order(
            "alice-order",
            "alice",
            "111-1111111-1111111",
        )]),
        FixedClock("2026-08-26T16:45:00Z"),
    );

    let updated = application
        .update_note(
            &Principal::agent(UserId::new("alice")),
            "alice-order",
            "Agent-authored note".to_string(),
            "2026-08-26T12:00:00Z".into(),
        )
        .await
        .unwrap();

    assert_eq!(updated.note.as_deref(), Some("Agent-authored note"));
    assert_eq!(updated.updated_at.as_deref(), Some("2026-08-26T16:45:00Z"));
}

#[tokio::test]
async fn agent_principal_cannot_delete_even_via_the_application_interface() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([order(
        "alice-order",
        "alice",
        "111-1111111-1111111",
    )]));
    let principal = Principal::agent(UserId::new("alice"));

    let result = application.delete_order(&principal, "alice-order").await;

    assert!(matches!(result, Err(ApplicationError::Forbidden)));
    assert_eq!(application.list_orders(&principal).await.unwrap().len(), 1);
}

#[tokio::test]
async fn extension_patch_preserves_its_client_generated_timestamp() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([order(
        "alice-order",
        "alice",
        "111-1111111-1111111",
    )]));
    let principal = Principal::extension(UserId::new("alice"));

    let updated = application
        .update_order(
            &principal,
            "alice-order",
            UpdateOrder {
                status: Some(OrderStatus::Commented),
                note: Some("Extension note".to_string()),
                updated_at: Some("2026-08-26T17:00:00Z".to_string()),
                deleted_at: None,
                ..UpdateOrder::default()
            },
        )
        .await
        .unwrap();

    assert_eq!(updated.status, OrderStatus::Commented);
    assert_eq!(updated.note.as_deref(), Some("Extension note"));
    assert_eq!(updated.updated_at.as_deref(), Some("2026-08-26T17:00:00Z"));
}

#[tokio::test]
async fn batch_upsert_rejects_more_than_one_hundred_orders_before_persistence() {
    let application =
        OrderApplication::new(InMemoryOrderRepository::with_orders(std::iter::empty()));
    let principal = Principal::extension(UserId::new("alice"));
    let inputs = (0..101)
        .map(|index| upsert_order(&format!("order-{index}"), &format!("number-{index}")))
        .collect();

    let result = application.batch_upsert_orders(&principal, inputs).await;

    assert!(matches!(result, Err(ApplicationError::InvalidInput(_))));
    assert!(application
        .list_orders(&principal)
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn agent_search_is_tenant_scoped_filtered_and_bounded() {
    let mut matching = order("alice-one", "alice", "111-1111111-1111111");
    matching.product_name = "Wireless Headphones".to_string();
    matching.status = OrderStatus::Commented;
    let mut second_match = order("alice-two", "alice", "222-2222222-2222222");
    second_match.note = Some("headphones return".to_string());
    second_match.status = OrderStatus::Commented;
    let mut wrong_status = order("alice-three", "alice", "333-3333333-3333333");
    wrong_status.product_name = "Headphones case".to_string();
    let mut other_user = order("bob-one", "bob", "444-4444444-4444444");
    other_user.product_name = "Wireless Headphones".to_string();
    other_user.status = OrderStatus::Commented;
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([
        matching,
        second_match,
        wrong_status,
        other_user,
    ]));

    let results = application
        .search_orders(
            &Principal::agent(UserId::new("alice")),
            OrderSearch {
                query: Some("HEADPHONES".to_string()),
                status: Some(OrderStatus::Commented),
                limit: 1,
                ..OrderSearch::default()
            },
        )
        .await
        .unwrap();

    assert_eq!(results.orders.len(), 1);
    assert_eq!(results.orders[0].order.user_id, "alice");
    assert_eq!(results.orders[0].order.status, OrderStatus::Commented);
}

#[tokio::test]
async fn search_rejects_an_empty_query_instead_of_accidentally_listing_everything() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([order(
        "alice-order",
        "alice",
        "111-1111111-1111111",
    )]));

    let result = application
        .search_orders(
            &Principal::agent(UserId::new("alice")),
            OrderSearch {
                query: Some("   ".to_string()),
                status: None,
                limit: 50,
                ..OrderSearch::default()
            },
        )
        .await;

    assert!(matches!(
        result,
        Err(ApplicationError::InvalidInput(message))
            if message == "Search query must not be empty"
    ));
}

#[tokio::test]
async fn patch_without_timestamp_advances_the_sync_clock() {
    let app = OrderApplication::with_clock(
        InMemoryOrderRepository::with_orders([order("one", "alice", "123")]),
        FixedClock("2026-09-15T12:00:00Z"),
    );
    let updated = app
        .update_order(
            &Principal::extension(UserId::new("alice")),
            "one",
            UpdateOrder {
                status: None,
                note: Some("new note".into()),
                updated_at: None,
                deleted_at: None,
                ..UpdateOrder::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(updated.updated_at.as_deref(), Some("2026-09-15T12:00:00Z"));
}

#[tokio::test]
async fn timestamps_compare_instants_instead_of_string_precision() {
    let mut cloud = order("cloud", "alice", "123");
    cloud.updated_at = Some("2026-09-15T12:00:00.123456Z".into());
    let app = OrderApplication::new(InMemoryOrderRepository::with_orders([cloud]));
    let mut stale = upsert_order("local", "123");
    stale.updated_at = Some("2026-09-15T12:00:00.123Z".into());
    let result = app
        .upsert_order(&Principal::extension(UserId::new("alice")), stale)
        .await
        .unwrap();
    assert_eq!(result.id, "cloud");
    assert_eq!(
        result.updated_at.as_deref(),
        Some("2026-09-15T12:00:00.123456Z")
    );
}

#[tokio::test]
async fn deletion_remains_in_sync_and_cannot_be_resurrected_by_a_stale_replica() {
    let app = OrderApplication::with_clock(
        InMemoryOrderRepository::with_orders([order("one", "alice", "123")]),
        FixedClock("2026-09-15T12:00:00Z"),
    );
    let principal = Principal::extension(UserId::new("alice"));
    app.delete_order(&principal, "one").await.unwrap();
    let sync = app.list_orders(&principal).await.unwrap();
    assert_eq!(sync.len(), 1, "replicas need the deletion record");
    assert!(sync[0].deleted_at.is_some());
    let result = app
        .upsert_order(&principal, upsert_order("offline", "123"))
        .await
        .unwrap();
    assert!(result.deleted_at.is_some());
    assert!(app
        .list_orders(&Principal::agent(UserId::new("alice")))
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
#[ignore = "requires a disposable MongoDB via MONGODB_TEST_URI"]
async fn mongo_replication_preserves_the_latest_write_and_tombstones() {
    use super::{MongoOrderRepository, TenantScopedOrderRepository};
    use mongodb::{bson::doc, options::IndexOptions, IndexModel};
    let client =
        mongodb::Client::with_uri_str(std::env::var("MONGODB_TEST_URI").expect("MONGODB_TEST_URI"))
            .await
            .unwrap();
    let collection = client
        .database("ordercue_tests")
        .collection(&format!("orders_{}", uuid::Uuid::new_v4().simple()));
    collection
        .create_index(
            IndexModel::builder()
                .keys(doc! { "user_id": 1, "order_number": 1 })
                .options(IndexOptions::builder().unique(true).build())
                .build(),
        )
        .await
        .unwrap();
    let repo = MongoOrderRepository::new(collection.clone());
    let uid = UserId::new("alice");
    let initial = repo
        .upsert_if_newer(&uid, order("one", "alice", "123"))
        .await
        .unwrap();
    assert!(initial.applied);
    let writes = (1..=30).map(|n| {
        let repo = &repo;
        let uid = &uid;
        async move {
            let mut next = order("other-id", "alice", "123");
            next.updated_at = Some(format!("2026-09-15T12:00:00.{n:06}Z"));
            next.note = Some(format!("$literal-{n}"));
            repo.upsert_if_newer(uid, next).await.unwrap();
        }
    });
    futures::future::join_all(writes).await;
    let mut stale = order("stale", "alice", "123");
    stale.updated_at = Some("2026-09-15T12:00:00.000Z".into());
    let result = repo.upsert_if_newer(&uid, stale).await.unwrap();
    assert!(!result.applied);
    assert_eq!(result.order.note.as_deref(), Some("$literal-30"));
    assert_eq!(repo.list(&uid).await.unwrap().len(), 1);
    let app = OrderApplication::with_clock(repo, FixedClock("2026-09-15T13:00:00Z"));
    let principal = Principal::extension(uid);
    app.delete_order(&principal, &result.order.id)
        .await
        .unwrap();
    let canonical = app
        .upsert_order(&principal, upsert_order("offline", "123"))
        .await
        .unwrap();
    assert!(canonical.deleted_at.is_some());
    let mut paid = order("paid", "alice", "423");
    paid.status = OrderStatus::Reimbursed;
    collection
        .insert_many(
            [
                order("later", "alice", "323"),
                order("next", "alice", "223"),
                paid,
                order("private", "bob", "200"),
            ]
            .into_iter()
            .map(crate::models::OrderEntity::from),
        )
        .await
        .unwrap();
    let first = app
        .search_orders(
            &principal,
            OrderSearch {
                limit: 1,
                pending_only: true,
                ..OrderSearch::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(first.orders[0].order.id, "next");
    assert_eq!(first.next_cursor.as_deref(), Some("223"));
    let second = app
        .search_orders(
            &principal,
            OrderSearch {
                limit: 1,
                pending_only: true,
                after: first.next_cursor,
                ..OrderSearch::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(second.orders[0].order.id, "later");
    assert!(second.next_cursor.is_none());
    collection.drop().await.unwrap();
}

#[tokio::test]
async fn server_commands_advance_a_future_version_and_reject_stale_patch() {
    let mut ahead = order("one", "alice", "123");
    ahead.updated_at = Some("2026-09-15T12:05:00.123456789Z".into());
    let app = OrderApplication::with_clock(
        InMemoryOrderRepository::with_orders([ahead]),
        FixedClock("2026-09-15T12:00:00Z"),
    );
    let principal = Principal::extension(UserId::new("alice"));
    let updated = app
        .update_status(
            &principal,
            "one",
            OrderStatus::Commented,
            "2026-09-15T12:05:00.123456789Z".into(),
        )
        .await
        .unwrap();
    assert_eq!(
        updated.updated_at.as_deref(),
        Some("2026-09-15T12:05:00.12345679Z")
    );
    let updated = app
        .update_note(
            &principal,
            "one",
            "latest".into(),
            "2026-09-15T12:05:00.12345679Z".into(),
        )
        .await
        .unwrap();
    assert_eq!(
        updated.updated_at.as_deref(),
        Some("2026-09-15T12:05:00.123456791Z")
    );
    let stale = app
        .update_order(
            &principal,
            "one",
            UpdateOrder {
                note: Some("stale".into()),
                updated_at: Some("2026-09-15T12:00:00Z".into()),
                ..UpdateOrder::default()
            },
        )
        .await;
    assert!(matches!(stale, Err(ApplicationError::Conflict)));
    app.delete_order(&principal, "one").await.unwrap();
    let deleted = app.list_orders(&principal).await.unwrap().remove(0);
    assert_eq!(deleted.deleted_at, deleted.updated_at);
    assert_eq!(
        deleted.updated_at.as_deref(),
        Some("2026-09-15T12:05:00.123456792Z")
    );
    let patch_deleted = app
        .update_order(
            &principal,
            "one",
            UpdateOrder {
                note: Some("restore by accident".into()),
                updated_at: Some("2026-09-16T00:00:00Z".into()),
                ..UpdateOrder::default()
            },
        )
        .await;
    assert!(matches!(patch_deleted, Err(ApplicationError::NotFound)));
}

#[tokio::test]
#[ignore = "requires a disposable MongoDB via MONGODB_TEST_URI"]
async fn mongo_replication_commands_preserve_fields_versions_and_deletions() {
    use super::{MongoOrderRepository, TenantScopedOrderRepository};
    use mongodb::{bson::doc, options::IndexOptions, IndexModel};
    let client = mongodb::Client::with_uri_str(std::env::var("MONGODB_TEST_URI").unwrap())
        .await
        .unwrap();
    let collection = client
        .database("ordercue_tests")
        .collection(&format!("commands_{}", uuid::Uuid::new_v4().simple()));
    collection
        .create_index(
            IndexModel::builder()
                .keys(doc! { "user_id": 1, "order_number": 1 })
                .options(IndexOptions::builder().unique(true).build())
                .build(),
        )
        .await
        .unwrap();
    let repo = MongoOrderRepository::new(collection.clone());
    let uid = UserId::new("alice");
    let mut original = order("one", "alice", "123");
    original.updated_at = Some("2026-09-15T12:05:00.123456789Z".into());
    repo.upsert_if_newer(&uid, original.clone()).await.unwrap();
    let app = OrderApplication::with_clock(repo, FixedClock("2026-09-15T12:00:00Z"));
    let principal = Principal::extension(uid.clone());
    // Both commands must survive even with an identical, earlier server clock.
    let (status, note) = tokio::join!(
        app.update_order(
            &principal,
            "one",
            UpdateOrder {
                status: Some(OrderStatus::Commented),
                ..UpdateOrder::default()
            }
        ),
        app.update_order(
            &principal,
            "one",
            UpdateOrder {
                note: Some("$literal saved note".into()),
                ..UpdateOrder::default()
            }
        ),
    );
    status.unwrap();
    note.unwrap();
    let current = app.get_order(&principal, "one").await.unwrap();
    assert_eq!(current.status, OrderStatus::Commented);
    assert_eq!(current.note.as_deref(), Some("$literal saved note"));
    assert_eq!(
        current.updated_at.as_deref(),
        Some("2026-09-15T12:05:00.123456791Z")
    );
    assert!(matches!(
        app.update_order(
            &principal,
            "one",
            UpdateOrder {
                note: Some("stale".into()),
                updated_at: original.updated_at.clone(),
                ..UpdateOrder::default()
            }
        )
        .await,
        Err(ApplicationError::Conflict)
    ));
    let expected = current.updated_at.clone().unwrap();
    let (first, second) = tokio::join!(
        app.update_note(
            &principal,
            "one",
            "first guarded write".into(),
            expected.clone()
        ),
        app.update_note(&principal, "one", "second guarded write".into(), expected)
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    assert!(
        matches!(first, Err(ApplicationError::Conflict))
            || matches!(second, Err(ApplicationError::Conflict))
    );
    app.batch_delete_orders(&principal, vec!["one".into(), "one".into()])
        .await
        .unwrap();
    let repo = MongoOrderRepository::new(collection.clone());
    let unchanged_replica = repo.upsert_if_newer(&uid, original).await.unwrap();
    assert!(!unchanged_replica.applied);
    assert_eq!(
        unchanged_replica.order.deleted_at,
        unchanged_replica.order.updated_at
    );
    assert_eq!(
        unchanged_replica.order.updated_at.as_deref(),
        Some("2026-09-15T12:05:00.123456793Z")
    );
    assert_eq!(repo.list(&uid).await.unwrap().len(), 1);
    collection.drop().await.unwrap();
}

#[tokio::test]
async fn pagination_reaches_every_owned_live_order_even_when_the_cursor_order_is_deleted() {
    let mut records: Vec<_> = (0..205)
        .rev()
        .map(|i| order(&format!("id-{i}"), "alice", &format!("{i:03}")))
        .collect();
    records.push(order("private", "bob", "105"));
    let app = OrderApplication::new(InMemoryOrderRepository::with_orders(records));
    let principal = Principal::agent(UserId::new("alice"));
    let mut after = None;
    let mut seen = std::collections::BTreeSet::new();
    loop {
        let page = app
            .search_orders(
                &principal,
                OrderSearch {
                    after,
                    limit: 100,
                    ..OrderSearch::default()
                },
            )
            .await
            .unwrap();
        for entry in &page.orders {
            assert_eq!(entry.order.user_id, "alice");
            assert!(seen.insert(entry.order.id.clone()));
        }
        if let Some(last) = page.orders.last() {
            app.delete_order(&Principal::extension(UserId::new("alice")), &last.order.id)
                .await
                .unwrap();
        }
        after = page.next_cursor;
        if after.is_none() {
            break;
        }
    }
    assert_eq!(seen.len(), 205);
}

#[tokio::test]
async fn agent_writes_require_the_read_version_and_recheck_it_atomically() {
    let mut original = order("one", "alice", "123");
    original.updated_at = None;
    original.created_at = None;
    let app = OrderApplication::new(InMemoryOrderRepository::with_orders([original]));
    let principal = Principal::agent(UserId::new("alice"));
    let (status, note) = tokio::join!(
        app.update_status(
            &principal,
            "one",
            OrderStatus::Commented,
            "unversioned".into()
        ),
        app.update_note(
            &principal,
            "one",
            "concurrent note".into(),
            "unversioned".into()
        )
    );
    assert_eq!(usize::from(status.is_ok()) + usize::from(note.is_ok()), 1);
    assert!(
        matches!(status, Err(ApplicationError::Conflict))
            || matches!(note, Err(ApplicationError::Conflict))
    );
    let current = app.get_order(&principal, "one").await.unwrap();
    let stale = app
        .update_note(&principal, "one", "overwrite".into(), "unversioned".into())
        .await;
    assert!(matches!(stale, Err(ApplicationError::Conflict)));
    let unchanged = app.get_order(&principal, "one").await.unwrap();
    assert_eq!(unchanged.note, current.note);
    let updated = app
        .update_note(
            &principal,
            "one",
            "new authorized note".into(),
            current.updated_at.unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(updated.note.as_deref(), Some("new authorized note"));
}

#[tokio::test]
async fn inbox_returns_pending_checks_with_versions_and_explicit_unknown_dates() {
    let mut paid = order("paid", "alice", "001");
    paid.status = OrderStatus::Reimbursed;
    let mut deleted = order("deleted", "alice", "002");
    deleted.deleted_at = Some("2026-08-27T00:00:00Z".into());
    let mut waiting = order("waiting", "alice", "003");
    waiting.status = OrderStatus::CommentRevealed;
    let mut unknown = order("unknown", "alice", "004");
    unknown.order_date = "unrecognized".into();
    unknown.status = OrderStatus::Commented;
    let app = OrderApplication::new(InMemoryOrderRepository::with_orders([
        paid,
        deleted,
        waiting,
        unknown,
        order("private", "bob", "005"),
    ]));
    let principal = Principal::agent(UserId::new("alice"));
    let first = app
        .order_inbox(&principal, "2026-09-23", None, 1)
        .await
        .unwrap();
    assert_eq!(first.items.len(), 1);
    let item = &first.items[0];
    assert_eq!(item.order.order.id, "waiting");
    assert_eq!(item.order.version, "2026-08-26T12:00:00Z");
    assert_eq!(item.days_since_order, Some(28));
    assert!(matches!(
        item.next_action,
        super::inbox::NextAction::ReturnOptions
    ));
    assert_eq!(item.return_check.as_ref().unwrap().stage, "urgent");
    let next = app
        .order_inbox(&principal, "2026-09-23", first.next_cursor, 1)
        .await
        .unwrap();
    assert_eq!(next.items.len(), 1);
    assert!(next.next_cursor.is_none());
    assert!(next.items[0].days_since_order.is_none());
    assert!(next.items[0].return_check.is_none());
    assert!(matches!(
        next.items[0].next_action,
        super::inbox::NextAction::ReviewVisibility
    ));
    assert!(matches!(
        app.order_inbox(&principal, "2026-02-30", None, 50).await,
        Err(ApplicationError::InvalidInput(_))
    ));
    assert!(matches!(
        app.order_inbox(&principal, "2026-09-23", None, 0).await,
        Err(ApplicationError::InvalidInput(_))
    ));
}
