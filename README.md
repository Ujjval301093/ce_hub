# C&E Employee Hub (`ce_hub`)

> **Mobile-First Employee Self-Service & Daily Work Hub for C and E Consultancy Private Limited**

---

## 📱 Features

1. **Check-In & Check-Out with Geofencing**:
   - One-tap check-in with GPS verification.
   - **Enforced Work Summary**: Check-Out requires submitting the daily activity log before checkout is confirmed.

2. **Daily Activity Log**:
   - Clean 2-field form (Date & Daily Work Summary).
   - Keeps historical record of daily tasks, site visits, and project progress.

3. **Leave & Attendance Self-Service**:
   - Apply for **Casual Leave**, **Earned Leave**, or **Leave Without Pay**.
   - Submit **Work From Home (WFH)** and **Overtime** requests.
   - View real-time accrued leave balances.

4. **Expense Claims**:
   - Submit fuel, food, boarding & lodging, and local conveyance claims.
   - Non-project remark support for local office / site expenses.

5. **1-Page Payslip Viewer**:
   - Monthly salary slip list and detailed 1-page breakdown (Basic, Overtime, Extra Days, Expenses, Advances, Net Pay).
   - One-click PDF print / download.

6. **Progressive Web App (PWA)**:
   - Installable directly on **iOS (Safari -> Add to Home Screen)** and **Android (Chrome -> Install App)**.

---

## 🚀 How to Deploy on Frappe Cloud

### Step 1: Push to GitHub
1. Create a new repository on GitHub (e.g. `https://github.com/your-username/ce_hub`).
2. Run in terminal:
   ```bash
   cd ce_hub
   git remote add origin https://github.com/your-username/ce_hub.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Install via Frappe Cloud Dashboard
1. Log into your **Frappe Cloud Dashboard** (`https://frappecloud.com`).
2. Select your site: `candeconsultancy.m.frappe.cloud`.
3. Under **Apps**, click **Add New App** -> Select **GitHub** and enter your repository URL `https://github.com/your-username/ce_hub`.
4. Click **Deploy**. Frappe Cloud will install the app on your bench automatically.

### Step 3: Access the App
Once deployed, all employees can access the app directly at:
👉 **`https://candeconsultancy.m.frappe.cloud/ce-hub`**

---

## 📲 How Employees Install on Phones

### On iPhone (iOS):
1. Open Safari and go to: `https://candeconsultancy.m.frappe.cloud/ce-hub`
2. Tap the **Share** icon (box with upward arrow at bottom).
3. Scroll down and tap **"Add to Home Screen"**.
4. The **C&E Hub** icon will appear on the home screen as a native app!

### On Android:
1. Open Google Chrome and go to: `https://candeconsultancy.m.frappe.cloud/ce-hub`
2. Tap the three dots (menu) at top-right -> Tap **"Install app"** or **"Add to Home screen"**.
3. Tap **Install**. The **C&E Hub** app is now installed on the phone!
