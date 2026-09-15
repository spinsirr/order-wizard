# Chrome Web Store Listing

## Title
OrderCue

## Summary
Manage and track your Amazon orders

## Description

OrderCue keeps the purchases you want to revisit in one focused Chrome side panel.

SAVE FROM AMAZON

Capture an order directly from Amazon Order History without retyping product details, order numbers, prices, or links.

STAY ORGANIZED

- Move each order through Pending, Commented, Revealed, and Reimbursed.
- Add a note for the next action or anything you want to remember.
- Search by product, order number, or note, then filter and sort the queue.
- Select orders with the mouse or keyboard and export your data when needed.
- Get return reminders for unreimbursed orders at 25, 28, and 30 days after ordering, with a toolbar badge and desktop alerts. Check the actual return deadline on Amazon.

RETURN TO THE SOURCE

Open the original Amazon order in one click. When you are ready to resell, use the Facebook Marketplace workflow to prepare a listing from the saved product details.

LOCAL-FIRST, WITH OPTIONAL SYNC

The extension works without an account and keeps changes in your browser by default. Sign in only if you want to sync your order queue across devices.

HOW TO USE

1. Go to your Amazon Order History page
2. Click "Save to OrderCue" on any order you want to track
3. Open the extension from Chrome's side panel to view and manage your orders
4. Update its status, add a note, or jump back to the original order

OrderCue is designed for a small, calm workflow: save what matters, see what needs attention, and finish the task where it belongs.

OrderCue is an independent product and is not affiliated with or endorsed by Amazon.

## Category
Tools

## Language
English

## Permissions Justification

**Host Permissions:**
- `*.amazon.com` - Required to read order details from your Amazon order history page and inject "Save" buttons
- `*.facebook.com` - Required to auto-fill listing forms on Facebook Marketplace with your saved order data
- `*.amazoncognito.com` - Required for optional cloud sync authentication

**Other Permissions:**
- `storage` - Store your saved orders locally on your device
- `activeTab` - Access the current tab to inject content scripts
- `sidePanel` - Display the order management interface in Chrome's side panel
- `identity` - Handle OAuth authentication for optional cloud sync
- `alarms` - Check saved order dates hourly for return reminders, including when the side panel is closed
- `notifications` - Remind you to check return options for orders still awaiting reimbursement
