# Chrome Web Store Listing

## Title
Amazon Order Wizard

## Summary
Track Amazon orders and list them on Facebook Marketplace

## Description

**Amazon Order Wizard** makes it easy to track Amazon orders and list them on Facebook Marketplace.

**WHY USE IT?**
Ever bought something on Amazon, needed to return it later, but couldn't find the order? Or wanted to track which orders you've commented on or gotten refunds for? Amazon Order Wizard solves this by letting you save and organize orders with a simple workflow.

**KEY FEATURES**

🔖 **One-Click Save**
Save orders directly from your Amazon order history page. Just click the "Save" button next to any order.

📊 **Status Tracking**
Track each order through your workflow:
• Uncommented → Commented → Comment Revealed → Reimbursed

📝 **Personal Notes**
Add notes to remember why you saved an order or any important details.

🔍 **Search & Filter**
Quickly find orders by product name, order number, or filter by status.

🛒 **Facebook Marketplace Integration**
Quickly list your Amazon purchases on Facebook Marketplace. Auto-fills product details, price, and images - just review and post.

☁️ **Cloud Sync (Optional)**
Sign in to sync your orders across devices. Works completely offline without an account - your data stays local until you choose to sync.

**PRIVACY**
Your order data is stored locally on your device. Cloud sync is optional and only activates when you sign in.

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
