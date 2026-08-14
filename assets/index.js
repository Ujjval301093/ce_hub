
function startCEHubApp() {
  if (typeof Vue === 'undefined' || !Vue.createApp) {
    setTimeout(startCEHubApp, 50);
    return;
  }

  const { createApp, ref, onMounted, computed, reactive, nextTick } = Vue;

  // HQ Coordinates & Geofence
  const HQ_LAT = 31.0938;
  const HQ_LNG = 77.2072;
  const MAX_RADIUS_METERS = 2000;

  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  const state = reactive({
    isLoggedIn: false,
    currentView: 'home',
    selectedSalarySlip: null,
    attendanceReqType: 'Work From Home',
    user: 'vardan.chauhan07@gmail.com',
    employeeInfo: {
      name: 'HR-EMP-00020',
      employee_name: 'Vardan Chauhan',
      designation: 'Field Executive',
      department: 'Admin',
      company: 'C and E Consultancy Private Limited'
    },
    todayStatus: {
      isCurrentlyIn: false,
      checked_in_time: null,
      checked_out_time: null,
      activity_logged: false
    },
    toast: { show: false, message: '', type: 'info' }
  });

  const showToast = (message, type = 'info') => {
    state.toast = { show: true, message, type };
    setTimeout(() => { state.toast.show = false; }, 4000);
  };

  const refreshIcons = () => {
    nextTick(() => {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    });
  };

  const getGPSLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        resolve({ lat: HQ_LAT, lng: HQ_LNG, dist: 10 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const dist = calculateDistanceMeters(lat, lng, HQ_LAT, HQ_LNG);
          resolve({ lat, lng, dist });
        },
        (err) => {
          resolve({ lat: HQ_LAT, lng: HQ_LNG, dist: 10 });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  };

  const API = {
    async req(url, options = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (window.csrf_token) headers['X-Frappe-CSRF-Token'] = window.csrf_token;
      const res = await fetch(url, { credentials: 'include', headers, ...options });
      const data = await res.json();
      if (data.exc || data.exception) {
        let msg = 'Error';
        if (data._server_messages) {
          try { msg = JSON.parse(JSON.parse(data._server_messages)[0]).message; } catch(e) {}
        } else if (data.message) { msg = data.message; }
        throw new Error(msg);
      }
      return data;
    },

    async login(usr, pwd) {
      const res = await fetch('/api/method/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ usr, pwd })
      });
      return res.json();
    },

    async logout() {
      try { await fetch('/api/method/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
      localStorage.removeItem('ce_hub_auth');
      state.isLoggedIn = false;
    },

    async checkSession() {
      try {
        const r = await this.req('/api/method/frappe.auth.get_logged_user');
        if (r.message && r.message !== 'Guest') {
          state.isLoggedIn = true;
          state.user = r.message;
          localStorage.setItem('ce_hub_auth', '1');
          return true;
        }
      } catch(e) {}
      if (localStorage.getItem('ce_hub_auth') === '1') {
        state.isLoggedIn = true;
        return true;
      }
      state.isLoggedIn = false;
      return false;
    },

    async getTodayStatus() {
      const today = new Date().toISOString().split('T')[0];
      const empId = state.employeeInfo.name;
      let checkins = [];
      let acts = [];
      
      try {
        const r1 = await this.req(`/api/resource/Employee Checkin?filters=[["employee","=","${empId}"],["time",">=","${today} 00:00:00"]]&fields=["name","log_type","time","latitude","longitude"]&order_by=time%20desc`);
        checkins = r1.data || [];
      } catch(e) {}
      
      try {
        const r2 = await this.req(`/api/resource/Employee Activity Log?filters=[["employee","=","${empId}"],["date","=","${today}"]]&fields=["name","work_done"]`);
        acts = r2.data || [];
      } catch(e) {}
      
      const latestCheckin = checkins.length > 0 ? checkins[0] : null;
      const isCurrentlyIn = latestCheckin && latestCheckin.log_type === 'IN';
      
      let in_time = null;
      let out_time = null;
      for (const c of checkins) {
        if (c.log_type === 'IN' && !in_time) in_time = c.time;
        if (c.log_type === 'OUT' && !out_time) out_time = c.time;
      }
      
      state.todayStatus = {
        isCurrentlyIn: !!isCurrentlyIn,
        checked_in_time: in_time,
        checked_out_time: out_time,
        activity_logged: acts.length > 0,
        activity_log_id: acts.length > 0 ? acts[0].name : null,
        activity_text: acts.length > 0 ? acts[0].work_done : ''
      };
    },

    async markCheckin(lat, lng) {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const doc = {
        doctype: 'Employee Checkin',
        employee: state.employeeInfo.name,
        log_type: 'IN',
        time: nowStr,
        latitude: lat,
        longitude: lng,
        device_id: 'CE-Hub-PWA-GPS'
      };
      const r = await this.req('/api/resource/Employee Checkin', {
        method: 'POST',
        body: JSON.stringify(doc)
      });
      return r.data;
    },

    async markCheckout(lat, lng, activityText) {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const doc = {
        doctype: 'Employee Checkin',
        employee: state.employeeInfo.name,
        log_type: 'OUT',
        time: nowStr,
        latitude: lat,
        longitude: lng,
        custom_daily_activity: activityText || 'Completed daily work',
        device_id: 'CE-Hub-PWA-GPS'
      };
      const r = await this.req('/api/resource/Employee Checkin', {
        method: 'POST',
        body: JSON.stringify(doc)
      });
      return r.data;
    },

    async saveActivityLog(work_done, date) {
      const dt = date || new Date().toISOString().split('T')[0];
      const empId = state.employeeInfo.name;
      
      try {
        const ex = await this.req(`/api/resource/Employee Activity Log?filters=[["employee","=","${empId}"],["date","=","${dt}"]]&fields=["name"]`);
        if (ex.data && ex.data.length > 0) {
          const docName = ex.data[0].name;
          const r = await this.req(`/api/resource/Employee Activity Log/${docName}`, {
            method: 'PUT',
            body: JSON.stringify({ work_done })
          });
          return r.data;
        }
      } catch(e) {}
      
      const doc = {
        doctype: 'Employee Activity Log',
        employee: empId,
        date: dt,
        work_done: work_done
      };
      const r = await this.req('/api/resource/Employee Activity Log', {
        method: 'POST',
        body: JSON.stringify(doc)
      });
      return r.data;
    },

    async getActivityHistory() {
      try {
        const empId = state.employeeInfo.name;
        const r = await this.req(`/api/resource/Employee Activity Log?filters=[["employee","=","${empId}"]]&fields=["name","date","work_done"]&order_by=date%20desc&limit_page_length=30`);
        return r.data || [];
      } catch(e) { return []; }
    },

    async getLeaveBalance() {
      const today = new Date().toISOString().split('T')[0];
      try {
        const empId = state.employeeInfo.name;
        const r = await this.req(`/api/resource/Leave Allocation?filters=[["employee","=","${empId}"],["to_date",">=","${today}"],["docstatus","=","1"]]&fields=["leave_type","total_leaves_allocated","new_leaves_allocated","leaves_taken"]`);
        return r.data || [];
      } catch(e) { return []; }
    },

    async submitLeaveRequest(args) {
      const doc = {
        doctype: 'Leave Application',
        employee: state.employeeInfo.name,
        leave_type: args.leave_type,
        from_date: args.from_date,
        to_date: args.to_date,
        description: args.reason,
        half_day: args.half_day ? 1 : 0,
        status: 'Open'
      };
      const r = await this.req('/api/resource/Leave Application', {
        method: 'POST',
        body: JSON.stringify(doc)
      });
      return r.data;
    },

    async submitAttendanceRequest(args) {
      const doc = {
        doctype: 'Attendance Request',
        employee: state.employeeInfo.name,
        reason: args.reason,
        from_date: args.from_date,
        to_date: args.to_date,
        explanation: args.explanation
      };
      const r = await this.req('/api/resource/Attendance Request', {
        method: 'POST',
        body: JSON.stringify(doc)
      });
      return r.data;
    },

    async getMyRequests() {
      const empId = state.employeeInfo.name;
      let leaves = [];
      let attendance = [];
      try {
        const l = await this.req(`/api/resource/Leave Application?filters=[["employee","=","${empId}"]]&fields=["name","leave_type","from_date","to_date","status","creation"]&order_by=creation%20desc&limit_page_length=20`);
        leaves = l.data || [];
      } catch(e) {}
      try {
        const a = await this.req(`/api/resource/Attendance Request?filters=[["employee","=","${empId}"]]&fields=["name","reason","from_date","to_date","docstatus","creation"]&order_by=creation%20desc&limit_page_length=20`);
        attendance = a.data || [];
      } catch(e) {}
      return { leaves, attendance };
    },

    async submitExpenseClaim(expenses, project, remark) {
      const doc = {
        doctype: 'Expense Claim',
        employee: state.employeeInfo.name,
        company: state.employeeInfo.company,
        project: project || null,
        custom_non_project_remark: remark || '',
        remark: remark || 'Submitted via C&E Hub PWA',
        expenses: expenses.map(e => ({
          expense_type: e.expense_type,
          amount: parseFloat(e.amount),
          description: e.description,
          custom_expense_remark: e.description
        }))
      };
      const r = await this.req('/api/resource/Expense Claim', {
        method: 'POST',
        body: JSON.stringify(doc)
      });
      return r.data;
    },

    async getSalarySlips() {
      try {
        const empId = state.employeeInfo.name;
        const r = await this.req(`/api/resource/Salary Slip?filters=[["employee","=","${empId}"],["docstatus","=","1"]]&fields=["name","posting_date","net_pay","status","start_date","end_date"]&order_by=start_date%20desc&limit_page_length=24`);
        return r.data || [];
      } catch(e) { return []; }
    },

    async getSalarySlipDetail(name) {
      const r = await this.req(`/api/resource/Salary Slip/${name}`);
      return r.data;
    }
  };

  const App = {
    template: `
      <div id="app" class="font-sans antialiased min-h-screen bg-gray-50 text-gray-900">
        <!-- Toast Notification -->
        <div 
          v-if="state.toast.show" 
          class="fixed top-4 left-4 right-4 z-50 p-3.5 rounded-xl text-white text-xs font-semibold shadow-xl flex items-center justify-between transition-all"
          :class="{
            'bg-emerald-600': state.toast.type === 'success',
            'bg-rose-600': state.toast.type === 'error',
            'bg-blue-600': state.toast.type === 'info'
          }">
          <span>{{ state.toast.message }}</span>
          <button @click="state.toast.show = false" class="text-white/80 ml-2 font-bold">✕</button>
        </div>

        <!-- SCREEN 1: LOGIN (Shown when logged out) -->
        <div v-if="!state.isLoggedIn" class="min-h-screen flex flex-col justify-center items-center px-4 bg-gradient-to-b from-blue-50 to-gray-100">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <div class="flex flex-col items-center mb-6">
              <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-md mb-3">
                C&E
              </div>
              <h1 class="text-xl font-bold text-gray-900">C&E Employee Hub</h1>
              <p class="text-sm text-gray-500 mt-1">Sign in with your work account</p>
            </div>

            <form @submit.prevent="handleLogin" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Email / Username</label>
                <input v-model="loginEmail" type="text" required placeholder="vardan.chauhan07@gmail.com" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Password</label>
                <input v-model="loginPassword" type="password" required placeholder="••••••••" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm">
              </div>
              <button type="submit" :disabled="loginLoading" class="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl shadow-md hover:bg-blue-700 transition flex justify-center items-center">
                <span v-if="loginLoading" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                <span>Sign In</span>
              </button>
            </form>
          </div>
          <p class="text-xs text-gray-400 mt-6">C and E Consultancy Private Limited</p>
        </div>

        <!-- SCREEN 2: DASHBOARD & VIEWS -->
        <div v-else class="min-h-screen pb-20">
          
          <!-- VIEW A: HOME DASHBOARD -->
          <div v-if="state.currentView === 'home'">
            <!-- Header -->
            <div class="bg-blue-600 text-white px-5 pt-8 pb-12 rounded-b-3xl shadow-md">
              <div class="flex justify-between items-center mb-3">
                <div>
                  <p class="text-blue-100 text-xs font-medium uppercase tracking-wider">Welcome Back</p>
                  <h2 class="text-xl font-bold">{{ state.employeeInfo.employee_name }}</h2>
                  <p class="text-xs text-blue-200">{{ state.employeeInfo.designation }}</p>
                </div>
                <div class="w-11 h-11 bg-blue-500 rounded-full flex items-center justify-center font-bold text-base border-2 border-blue-400">
                  {{ state.employeeInfo.employee_name.charAt(0) }}
                </div>
              </div>
            </div>

            <!-- Main Container -->
            <div class="px-4 -mt-8 space-y-4">
              <!-- Dynamic Check In / Check Out Card -->
              <div class="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center space-x-2">
                    <span class="w-3 h-3 rounded-full animate-pulse" :class="state.todayStatus.isCurrentlyIn ? 'bg-emerald-500' : 'bg-gray-400'"></span>
                    <span class="text-sm font-bold text-gray-800">
                      {{ state.todayStatus.isCurrentlyIn ? 'Currently Checked In' : (state.todayStatus.checked_out_time ? 'Checked Out Today' : 'Not Checked In') }}
                    </span>
                  </div>
                  <span class="text-xs text-gray-500">{{ todayFormatted }}</span>
                </div>

                <!-- Green Check In Button -->
                <div v-if="!state.todayStatus.isCurrentlyIn" class="space-y-2">
                  <button 
                    @click="handleCheckIn" 
                    :disabled="actionLoading"
                    class="w-full py-4 bg-emerald-600 text-white font-bold text-base rounded-xl shadow-md hover:bg-emerald-700 transition flex items-center justify-center space-x-2">
                    <span v-if="actionLoading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                    <i data-lucide="map-pin" class="w-5 h-5"></i>
                    <span>{{ state.todayStatus.checked_out_time ? 'Check In Again (GPS)' : 'Check In Now (GPS)' }}</span>
                  </button>
                  <p class="text-[11px] text-center text-gray-500 flex items-center justify-center">
                    <i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-600 mr-1"></i>
                    Office Geofence Active (Within 2000m of Office)
                  </p>
                </div>

                <!-- Red Check Out Button -->
                <div v-else class="space-y-2">
                  <div class="bg-emerald-50 text-emerald-800 text-xs p-2.5 rounded-lg flex items-center justify-between">
                    <span>In Time: <strong>{{ formatTime(state.todayStatus.checked_in_time) }}</strong></span>
                    <span v-if="state.todayStatus.activity_logged" class="text-emerald-700 font-semibold">✓ Activity Logged</span>
                    <span v-else class="text-amber-700 font-semibold">⚠ Activity Pending</span>
                  </div>

                  <button 
                    @click="state.currentView = 'checkout'"
                    :disabled="actionLoading"
                    class="w-full py-3.5 bg-rose-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-rose-700 transition flex items-center justify-center space-x-2">
                    <i data-lucide="log-out" class="w-5 h-5"></i>
                    <span>Check Out (Submit Activity)</span>
                  </button>
                </div>
              </div>

              <!-- Quick Actions Grid -->
              <div>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">Quick Actions</h3>
                <div class="grid grid-cols-2 gap-3">
                  <div @click="state.currentView = 'activity'" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between cursor-pointer hover:shadow-md transition">
                    <div class="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center mb-3">
                      <i data-lucide="file-text" class="w-5 h-5"></i>
                    </div>
                    <div>
                      <p class="font-bold text-gray-900 text-sm">Activity Log</p>
                      <p class="text-[11px] text-gray-500">Record daily work</p>
                    </div>
                  </div>

                  <div @click="state.currentView = 'leave'" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between cursor-pointer hover:shadow-md transition">
                    <div class="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center mb-3">
                      <i data-lucide="calendar" class="w-5 h-5"></i>
                    </div>
                    <div>
                      <p class="font-bold text-gray-900 text-sm">Apply Leave</p>
                      <p class="text-[11px] text-gray-500">Casual / Earned</p>
                    </div>
                  </div>

                  <div @click="state.attendanceReqType = 'Work From Home'; state.currentView = 'attendance-req'" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between cursor-pointer hover:shadow-md transition">
                    <div class="w-10 h-10 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center mb-3">
                      <i data-lucide="clock" class="w-5 h-5"></i>
                    </div>
                    <div>
                      <p class="font-bold text-gray-900 text-sm">WFH / Overtime</p>
                      <p class="text-[11px] text-gray-500">Submit request</p>
                    </div>
                  </div>

                  <div @click="state.currentView = 'expense'" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between cursor-pointer hover:shadow-md transition">
                    <div class="w-10 h-10 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center mb-3">
                      <i data-lucide="receipt" class="w-5 h-5"></i>
                    </div>
                    <div>
                      <p class="font-bold text-gray-900 text-sm">Claim Expense</p>
                      <p class="text-[11px] text-gray-500">Fuel, food, stay</p>
                    </div>
                  </div>

                  <div @click="openSalaryList" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between cursor-pointer hover:shadow-md transition col-span-2">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
                          <i data-lucide="wallet" class="w-5 h-5"></i>
                        </div>
                        <div>
                          <p class="font-bold text-gray-900 text-sm">Salary Slips & Payslips</p>
                          <p class="text-[11px] text-gray-500">View 1-page breakdown & download PDFs</p>
                        </div>
                      </div>
                      <i data-lucide="chevron-right" class="text-gray-400"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- VIEW B: CHECK OUT VIEW (MANDATORY ACTIVITY LOG FIRST) -->
          <div v-else-if="state.currentView === 'checkout'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">Check Out & Work Summary</h2>
            </div>

            <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
              <div class="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg">
                <p class="text-xs text-rose-800 font-medium">
                  <strong>Mandatory:</strong> Please summarize the work you completed today before checking out.
                </p>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Today's Date</label>
                <input type="text" :value="todayFormatted" readonly class="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Daily Work Done / Activity Details *</label>
                <textarea 
                  v-model="checkoutWorkDone" 
                  rows="6" 
                  required 
                  placeholder="Describe tasks completed, site visits, design sheets, client meetings, etc..." 
                  class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none text-sm leading-relaxed"></textarea>
              </div>

              <button 
                @click="submitCheckOut" 
                :disabled="actionLoading || !checkoutWorkDone.trim()"
                class="w-full py-4 bg-rose-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-rose-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                <span v-if="actionLoading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                <i data-lucide="check-circle" class="w-5 h-5"></i>
                <span>Save Activity & Confirm Check Out</span>
              </button>
            </div>
          </div>

          <!-- VIEW C: ACTIVITY LOG -->
          <div v-else-if="state.currentView === 'activity'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">Add Daily Activity Log</h2>
            </div>

            <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
                <input type="text" :value="todayDateStr" readonly class="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Daily Work Done / Remarks *</label>
                <textarea 
                  v-model="activityLogText" 
                  rows="6" 
                  placeholder="Type your daily accomplishments, project updates, or notes..." 
                  class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm leading-relaxed"></textarea>
              </div>

              <button 
                @click="saveActivity" 
                :disabled="actionLoading || !activityLogText.trim()"
                class="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                <span v-if="actionLoading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                <i data-lucide="save" class="w-5 h-5"></i>
                <span>Save Daily Activity</span>
              </button>
            </div>
          </div>

          <!-- VIEW D: LEAVE REQUEST -->
          <div v-else-if="state.currentView === 'leave'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">Apply for Leave</h2>
            </div>

            <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Leave Type</label>
                <select v-model="leaveForm.leave_type" class="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium">
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Earned Leave">Earned Leave</option>
                  <option value="Leave Without Pay">Leave Without Pay (LWP)</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-gray-700 uppercase mb-1">From Date</label>
                  <input type="date" v-model="leaveForm.from_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-700 uppercase mb-1">To Date</label>
                  <input type="date" v-model="leaveForm.to_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
                </div>
              </div>

              <div class="flex items-center space-x-2">
                <input type="checkbox" id="half_day" v-model="leaveForm.half_day" class="w-4 h-4 text-blue-600 rounded">
                <label for="half_day" class="text-sm font-medium text-gray-700">Half Day Leave</label>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Reason for Leave *</label>
                <textarea v-model="leaveForm.reason" rows="4" required placeholder="Please provide reason..." class="w-full p-3 border border-gray-300 rounded-xl text-sm"></textarea>
              </div>

              <button 
                @click="submitLeave" 
                :disabled="actionLoading || !leaveForm.reason.trim()"
                class="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                <span v-if="actionLoading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                <span>Submit Leave Application</span>
              </button>
            </div>
          </div>

          <!-- VIEW E: ATTENDANCE REQUEST (WFH / OVERTIME) -->
          <div v-else-if="state.currentView === 'attendance-req'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">{{ attForm.reason }} Request</h2>
            </div>

            <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Request Type</label>
                <select v-model="attForm.reason" class="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium">
                  <option value="Work From Home">Work From Home (WFH)</option>
                  <option value="Overtime">Overtime</option>
                  <option value="On Duty">On Duty (Site Visit)</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-gray-700 uppercase mb-1">From Date</label>
                  <input type="date" v-model="attForm.from_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-700 uppercase mb-1">To Date</label>
                  <input type="date" v-model="attForm.to_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Explanation / Hours / Remarks *</label>
                <textarea v-model="attForm.explanation" rows="4" required placeholder="Describe task details or hours worked..." class="w-full p-3 border border-gray-300 rounded-xl text-sm"></textarea>
              </div>

              <button 
                @click="submitAttendanceReq" 
                :disabled="actionLoading || !attForm.explanation.trim()"
                class="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                <span v-if="actionLoading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                <span>Submit Request</span>
              </button>
            </div>
          </div>

          <!-- VIEW F: EXPENSE CLAIM -->
          <div v-else-if="state.currentView === 'expense'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">Claim Expense</h2>
            </div>

            <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Expense Category</label>
                <select v-model="expItem.expense_type" class="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium">
                  <option value="Fuel Expense">Fuel Expense</option>
                  <option value="Food Expense">Food Expense</option>
                  <option value="Boarding & Lodging">Boarding & Lodging (Hotel/Stay)</option>
                  <option value="Local Conveyance">Local Conveyance / Travel</option>
                  <option value="Other Expenses">Other Misc Expense</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Claim Amount (₹ INR) *</label>
                <input type="number" step="any" v-model="expItem.amount" required placeholder="e.g. 1500" class="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold">
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Description / Bill Details</label>
                <input type="text" v-model="expItem.description" placeholder="e.g. Site fuel receipt, highway toll" class="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm">
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Non-Project Remarks (if no project)</label>
                <textarea v-model="expRemark" rows="2" placeholder="Local office run, vehicle maintenance note..." class="w-full p-2.5 border border-gray-300 rounded-xl text-sm"></textarea>
              </div>

              <button 
                @click="submitExpense" 
                :disabled="actionLoading || !expItem.amount"
                class="w-full py-3.5 bg-purple-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                <span v-if="actionLoading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                <i data-lucide="send" class="w-5 h-5"></i>
                <span>Submit Expense Claim</span>
              </button>
            </div>
          </div>

          <!-- VIEW G: SALARY SLIP LIST -->
          <div v-else-if="state.currentView === 'salary'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">My Salary Slips</h2>
            </div>

            <div v-if="salaryLoading" class="flex justify-center py-12">
              <span class="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full"></span>
            </div>

            <div v-else-if="salarySlips.length" class="space-y-3">
              <div 
                v-for="slip in salarySlips" 
                :key="slip.name" 
                @click="viewSalaryDetail(slip.name)"
                class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md transition">
                <div>
                  <p class="font-bold text-gray-900 text-sm">{{ formatMonth(slip.start_date) }}</p>
                  <p class="text-xs text-gray-500 mt-0.5">Ref: {{ slip.name }}</p>
                </div>
                <div class="text-right">
                  <p class="font-bold text-emerald-600 text-sm">₹{{ Number(slip.net_pay || 0).toLocaleString('en-IN') }}</p>
                  <span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold mt-1">Paid</span>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-12 text-gray-500 text-sm">
              No salary slips found.
            </div>
          </div>

          <!-- VIEW H: SALARY DETAIL (1-PAGE VIEW) -->
          <div v-else-if="state.currentView === 'salary-detail'" class="p-4">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center">
                <button @click="state.currentView = 'salary'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
                <h2 class="text-lg font-bold text-gray-900">Salary Slip</h2>
              </div>
              <button @click="printSlip" class="text-xs bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1">
                <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                <span>Print / PDF</span>
              </button>
            </div>

            <div v-if="salaryLoading" class="flex justify-center py-12">
              <span class="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full"></span>
            </div>

            <div v-else-if="state.selectedSalarySlip" class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
              <div class="text-center border-b pb-3">
                <h3 class="font-bold text-gray-900 text-base">C&E CONSULTANCY PRIVATE LIMITED</h3>
                <p class="text-xs text-gray-500">Salary Slip for {{ formatMonth(state.selectedSalarySlip.start_date) }}</p>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl">
                <div><span class="text-gray-500">Employee:</span> <strong class="text-gray-800">{{ state.selectedSalarySlip.employee_name }}</strong></div>
                <div><span class="text-gray-500">Emp ID:</span> <strong class="text-gray-800">{{ state.selectedSalarySlip.employee }}</strong></div>
                <div><span class="text-gray-500">Designation:</span> <strong class="text-gray-800">{{ state.selectedSalarySlip.designation }}</strong></div>
                <div><span class="text-gray-500">Department:</span> <strong class="text-gray-800">{{ state.selectedSalarySlip.department }}</strong></div>
                <div><span class="text-gray-500">Bank A/c:</span> <strong class="text-gray-800">{{ state.selectedSalarySlip.bank_account_no || 'On Record' }}</strong></div>
                <div><span class="text-gray-500">IFSC:</span> <strong class="text-gray-800">{{ state.selectedSalarySlip.ifsc_code || 'On Record' }}</strong></div>
              </div>

              <div>
                <h4 class="text-xs font-bold text-gray-700 uppercase mb-2 border-b pb-1">Earnings</h4>
                <div class="space-y-1.5 text-xs">
                  <div class="flex justify-between"><span>Basic Salary</span><strong>₹{{ fmt(state.selectedSalarySlip.custom_base_gross || state.selectedSalarySlip.gross_pay) }}</strong></div>
                  <div v-if="state.selectedSalarySlip.custom_overtime_payment" class="flex justify-between text-blue-700"><span>Overtime Payment ({{ state.selectedSalarySlip.custom_overtime_hours }} hrs)</span><strong>₹{{ fmt(state.selectedSalarySlip.custom_overtime_payment) }}</strong></div>
                  <div v-if="state.selectedSalarySlip.custom_extra_day_payment" class="flex justify-between text-blue-700"><span>Extra Days Payment ({{ state.selectedSalarySlip.custom_extra_working_days }} days)</span><strong>₹{{ fmt(state.selectedSalarySlip.custom_extra_day_payment) }}</strong></div>
                  <div v-if="state.selectedSalarySlip.custom_fuel_expense" class="flex justify-between"><span>Fuel Reimbursement</span><strong>₹{{ fmt(state.selectedSalarySlip.custom_fuel_expense) }}</strong></div>
                  <div v-if="state.selectedSalarySlip.custom_food_expense" class="flex justify-between"><span>Food Reimbursement</span><strong>₹{{ fmt(state.selectedSalarySlip.custom_food_expense) }}</strong></div>
                  <div v-if="state.selectedSalarySlip.custom_misc_expense" class="flex justify-between"><span>Boarding & Lodging / Misc</span><strong>₹{{ fmt(state.selectedSalarySlip.custom_misc_expense) }}</strong></div>
                </div>
              </div>

              <div>
                <h4 class="text-xs font-bold text-gray-700 uppercase mb-2 border-b pb-1">Deductions</h4>
                <div class="space-y-1.5 text-xs">
                  <div v-if="state.selectedSalarySlip.custom_leave_deductions || state.selectedSalarySlip.absent_days" class="flex justify-between text-rose-700"><span>Leave Deductions</span><strong>-₹{{ fmt(state.selectedSalarySlip.custom_leave_deductions) }}</strong></div>
                  <div v-if="state.selectedSalarySlip.custom_advances" class="flex justify-between text-rose-700"><span>Advance Deduction</span><strong>-₹{{ fmt(state.selectedSalarySlip.custom_advances) }}</strong></div>
                  <div v-if="!state.selectedSalarySlip.custom_leave_deductions && !state.selectedSalarySlip.custom_advances" class="text-gray-400 italic">No deductions this month</div>
                </div>
              </div>

              <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <p class="text-xs text-emerald-800 font-semibold uppercase">Total Net Payable</p>
                  <p class="text-[11px] text-emerald-600">Transferred to Bank Account</p>
                </div>
                <div class="text-xl font-black text-emerald-700">
                  ₹{{ fmt(state.selectedSalarySlip.net_pay) }}
                </div>
              </div>
            </div>
          </div>

          <!-- VIEW I: HISTORY -->
          <div v-else-if="state.currentView === 'history'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">My History</h2>
            </div>

            <div class="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-4">
              <button @click="historyTab = 'activity'" :class="historyTab === 'activity' ? 'bg-blue-600 text-white font-bold' : 'text-gray-600'" class="flex-1 py-2 text-xs rounded-lg transition">Activity Logs</button>
              <button @click="historyTab = 'requests'" :class="historyTab === 'requests' ? 'bg-blue-600 text-white font-bold' : 'text-gray-600'" class="flex-1 py-2 text-xs rounded-lg transition">Requests</button>
            </div>

            <div v-if="historyLoading" class="flex justify-center py-12">
              <span class="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full"></span>
            </div>

            <div v-else-if="historyTab === 'activity'" class="space-y-3">
              <div v-for="log in activityHistory" :key="log.name" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div class="flex justify-between items-center mb-1.5">
                  <span class="font-bold text-xs text-blue-700">{{ log.date }}</span>
                  <span class="text-[10px] text-gray-400">{{ log.name }}</span>
                </div>
                <p class="text-xs text-gray-800 whitespace-pre-line leading-relaxed">{{ log.work_done }}</p>
              </div>
              <div v-if="!activityHistory.length" class="text-center py-12 text-gray-400 text-sm">No activity logs recorded yet.</div>
            </div>

            <div v-else-if="historyTab === 'requests'" class="space-y-3">
              <div v-for="req in requestHistory.leaves" :key="req.name" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                  <p class="font-bold text-xs text-gray-900">{{ req.leave_type }}</p>
                  <p class="text-[11px] text-gray-500">{{ req.from_date }} to {{ req.to_date }}</p>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold" :class="req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">{{ req.status }}</span>
              </div>

              <div v-for="req in requestHistory.attendance" :key="req.name" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                  <p class="font-bold text-xs text-gray-900">{{ req.reason }}</p>
                  <p class="text-[11px] text-gray-500">{{ req.from_date }} to {{ req.to_date }}</p>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold" :class="req.docstatus === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">{{ req.docstatus === 1 ? 'Approved' : 'Pending' }}</span>
              </div>

              <div v-if="!requestHistory.leaves?.length && !requestHistory.attendance?.length" class="text-center py-12 text-gray-400 text-sm">No requests found.</div>
            </div>
          </div>

          <!-- VIEW J: PROFILE -->
          <div v-else-if="state.currentView === 'profile'" class="p-4">
            <div class="flex items-center mb-4">
              <button @click="state.currentView = 'home'" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
              <h2 class="text-lg font-bold text-gray-900">My Profile</h2>
            </div>

            <div class="bg-white rounded-2xl p-6 shadow-md border border-gray-100 flex flex-col items-center text-center mb-4">
              <div class="w-20 h-20 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-2xl border-4 border-white shadow-sm mb-3">
                {{ state.employeeInfo.employee_name.charAt(0) }}
              </div>
              <h3 class="font-bold text-gray-900 text-base">{{ state.employeeInfo.employee_name }}</h3>
              <p class="text-xs text-blue-600 font-semibold">{{ state.employeeInfo.designation }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">{{ state.employeeInfo.department }}</p>
            </div>

            <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3 mb-4">
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Leave Balance</h4>
              <div v-if="leaveBalances.length" class="grid grid-cols-2 gap-2">
                <div v-for="bal in leaveBalances" :key="bal.leave_type" class="bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <p class="text-[11px] text-blue-800 font-medium">{{ bal.leave_type }}</p>
                  <p class="text-base font-bold text-blue-900">{{ Number(bal.total_leaves_allocated - (bal.leaves_taken || 0)).toFixed(1) }} days</p>
                </div>
              </div>
              <div v-else class="text-xs text-gray-400 italic">No active leave allocations</div>
            </div>

            <button @click="handleSignOut" class="w-full py-3.5 bg-white border border-rose-200 text-rose-600 font-bold text-sm rounded-xl shadow-sm hover:bg-rose-50 transition flex items-center justify-center space-x-2">
              <i data-lucide="log-out" class="w-4 h-4"></i>
              <span>Sign Out</span>
            </button>
          </div>

          <!-- BOTTOM NAVIGATION -->
          <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 shadow-lg px-4">
            <button @click="openHistory" :class="state.currentView === 'history' ? 'text-blue-600 font-semibold' : 'text-gray-500'" class="flex flex-col items-center flex-1 py-1 transition-colors">
              <i data-lucide="history" class="w-5 h-5"></i>
              <span class="text-[11px] mt-1">History</span>
            </button>
            <button @click="openProfile" :class="state.currentView === 'profile' ? 'text-blue-600 font-semibold' : 'text-gray-500'" class="flex flex-col items-center flex-1 py-1 transition-colors">
              <i data-lucide="user" class="w-5 h-5"></i>
              <span class="text-[11px] mt-1">Profile</span>
            </button>
          </nav>

        </div>
      </div>
    `,
    setup() {
      const loginEmail = ref('vardan.chauhan07@gmail.com');
      const loginPassword = ref('');
      const loginLoading = ref(false);
      const actionLoading = ref(false);

      const checkoutWorkDone = ref('');
      const activityLogText = ref('');
      const todayDateStr = new Date().toISOString().split('T')[0];
      
      const leaveForm = reactive({
        leave_type: 'Casual Leave',
        from_date: todayDateStr,
        to_date: todayDateStr,
        half_day: 0,
        reason: ''
      });

      const attForm = reactive({
        reason: 'Work From Home',
        from_date: todayDateStr,
        to_date: todayDateStr,
        explanation: ''
      });

      const expItem = reactive({
        expense_type: 'Fuel Expense',
        amount: '',
        description: ''
      });
      const expRemark = ref('');

      const salaryLoading = ref(false);
      const salarySlips = ref([]);
      const historyLoading = ref(false);
      const historyTab = ref('activity');
      const activityHistory = ref([]);
      const requestHistory = ref({ leaves: [], attendance: [] });
      const leaveBalances = ref([]);

      const todayFormatted = computed(() => {
        return new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
      });

      const formatTime = (timeStr) => {
        if (!timeStr) return '';
        const d = new Date(timeStr);
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      };

      const formatMonth = (dateStr) => {
        if (!dateStr) return 'Salary Slip';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      };

      const fmt = (val) => Number(val || 0).toLocaleString('en-IN');

      const handleLogin = async () => {
        loginLoading.value = true;
        try {
          const res = await API.login(loginEmail.value.trim(), loginPassword.value);
          if (res.message === 'Logged In' || res.full_name) {
            state.isLoggedIn = true;
            state.currentView = 'home';
            localStorage.setItem('ce_hub_auth', '1');
            showToast('Welcome to C&E Hub!', 'success');
            await API.getTodayStatus();
          } else {
            showToast('Invalid email or password', 'error');
          }
        } catch (e) {
          showToast(e.message || 'Login failed', 'error');
        } finally {
          loginLoading.value = false;
          refreshIcons();
        }
      };

      const handleSignOut = () => {
        API.logout();
        showToast('Signed out successfully', 'info');
        refreshIcons();
      };

      const handleCheckIn = async () => {
        actionLoading.value = true;
        try {
          showToast('Validating location & checking in...', 'info');
          const coords = await getGPSLocation();
          
          if (coords.dist > MAX_RADIUS_METERS) {
            showToast(`Outside Office Geofence (${coords.dist}m away. Max: ${MAX_RADIUS_METERS}m)`, 'error');
            actionLoading.value = false;
            return;
          }

          await API.markCheckin(coords.lat, coords.lng);
          showToast('Checked In successfully!', 'success');
          await API.getTodayStatus();
        } catch (e) {
          showToast(e.message || 'Check-in failed', 'error');
        } finally {
          actionLoading.value = false;
          refreshIcons();
        }
      };

      const submitCheckOut = async () => {
        if (!checkoutWorkDone.value.trim()) {
          showToast('Daily work summary is mandatory before checking out.', 'error');
          return;
        }
        actionLoading.value = true;
        try {
          await API.saveActivityLog(checkoutWorkDone.value.trim());
          const coords = await getGPSLocation();
          await API.markCheckout(coords.lat, coords.lng, checkoutWorkDone.value.trim());
          showToast('Work logged and Checked Out successfully!', 'success');
          state.currentView = 'home';
          checkoutWorkDone.value = '';
          await API.getTodayStatus();
        } catch (e) {
          showToast(e.message || 'Error during checkout', 'error');
        } finally {
          actionLoading.value = false;
          refreshIcons();
        }
      };

      const saveActivity = async () => {
        actionLoading.value = true;
        try {
          await API.saveActivityLog(activityLogText.value.trim());
          showToast('Activity log saved successfully!', 'success');
          state.currentView = 'home';
          await API.getTodayStatus();
        } catch (e) {
          showToast(e.message || 'Error saving log', 'error');
        } finally {
          actionLoading.value = false;
          refreshIcons();
        }
      };

      const submitLeave = async () => {
        actionLoading.value = true;
        try {
          await API.submitLeaveRequest(leaveForm);
          showToast('Leave application submitted!', 'success');
          state.currentView = 'home';
        } catch (e) {
          showToast(e.message || 'Failed to submit leave', 'error');
        } finally {
          actionLoading.value = false;
          refreshIcons();
        }
      };

      const submitAttendanceReq = async () => {
        actionLoading.value = true;
        try {
          await API.submitAttendanceRequest(attForm);
          showToast(`${attForm.reason} request submitted!`, 'success');
          state.currentView = 'home';
        } catch (e) {
          showToast(e.message || 'Submission failed', 'error');
        } finally {
          actionLoading.value = false;
          refreshIcons();
        }
      };

      const submitExpense = async () => {
        if (!expItem.amount) return;
        actionLoading.value = true;
        try {
          await API.submitExpenseClaim([expItem], null, expRemark.value);
          showToast('Expense claim submitted for approval!', 'success');
          state.currentView = 'home';
        } catch (e) {
          showToast(e.message || 'Submission failed', 'error');
        } finally {
          actionLoading.value = false;
          refreshIcons();
        }
      };

      const openSalaryList = async () => {
        state.currentView = 'salary';
        salaryLoading.value = true;
        try {
          salarySlips.value = await API.getSalarySlips();
        } catch(e) {}
        salaryLoading.value = false;
        refreshIcons();
      };

      const viewSalaryDetail = async (slipName) => {
        state.currentView = 'salary-detail';
        salaryLoading.value = true;
        try {
          state.selectedSalarySlip = await API.getSalarySlipDetail(slipName);
        } catch(e) {}
        salaryLoading.value = false;
        refreshIcons();
      };

      const printSlip = () => {
        if (state.selectedSalarySlip) {
          window.open(`/api/method/frappe.utils.print_format.download_pdf?doctype=Salary+Slip&name=${state.selectedSalarySlip.name}&format=Detailed+Salary+Slip`, '_blank');
        }
      };

      const openHistory = async () => {
        state.currentView = 'history';
        historyLoading.value = true;
        try {
          activityHistory.value = await API.getActivityHistory();
          requestHistory.value = await API.getMyRequests();
        } catch(e) {}
        historyLoading.value = false;
        refreshIcons();
      };

      const openProfile = async () => {
        state.currentView = 'profile';
        try {
          leaveBalances.value = await API.getLeaveBalance();
        } catch(e) {}
        refreshIcons();
      };

      onMounted(async () => {
        const logged = await API.checkSession();
        if (logged) {
          await API.getTodayStatus();
        }
        refreshIcons();
      });

      return {
        state,
        loginEmail,
        loginPassword,
        loginLoading,
        actionLoading,
        todayFormatted,
        todayDateStr,
        checkoutWorkDone,
        activityLogText,
        leaveForm,
        attForm,
        expItem,
        expRemark,
        salaryLoading,
        salarySlips,
        historyLoading,
        historyTab,
        activityHistory,
        requestHistory,
        leaveBalances,
        formatTime,
        formatMonth,
        fmt,
        handleLogin,
        handleSignOut,
        handleCheckIn,
        submitCheckOut,
        saveActivity,
        submitLeave,
        submitAttendanceReq,
        submitExpense,
        openSalaryList,
        viewSalaryDetail,
        printSlip,
        openHistory,
        openProfile
      };
    }
  };

  const app = createApp(App);
  app.mount('#app');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startCEHubApp);
} else {
  startCEHubApp();
}
