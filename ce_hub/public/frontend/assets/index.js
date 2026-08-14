const { createApp, ref, onMounted, computed, reactive, watch, nextTick } = Vue;
const { createRouter, createWebHashHistory, useRouter, useRoute } = VueRouter;

// ==========================================
// API Client Layer
// ==========================================
const API = {
  async call(method, args = {}) {
    try {
      const response = await fetch(`/api/method/ce_hub.api.${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': window.csrf_token || ''
        },
        credentials: 'include',
        body: JSON.stringify(args)
      });
      const data = await response.json();
      if (data.exc || data.exception) {
        let msg = 'An error occurred';
        if (data._server_messages) {
          try {
            msg = JSON.parse(JSON.parse(data._server_messages)[0]).message;
          } catch(e) {}
        } else if (data.exc_type) {
          msg = `${data.exc_type}: ${data.exception || ''}`;
        }
        throw new Error(msg);
      }
      return data.message;
    } catch (e) {
      console.error(`API error in ${method}:`, e);
      throw e;
    }
  },

  async login(usr, pwd) {
    const res = await fetch(`/api/method/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ usr, pwd })
    });
    return res.json();
  },

  async logout() {
    await fetch(`/api/method/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/ce-hub#/';
    window.location.reload();
  },

  getEmployeeInfo() { return this.call('get_employee_info'); },
  getTodayStatus() { return this.call('get_today_status'); },
  markCheckin(lat, lng) { return this.call('mark_checkin', { latitude: lat, longitude: lng }); },
  markCheckout(lat, lng) { return this.call('mark_checkout', { latitude: lat, longitude: lng }); },
  saveActivityLog(work_done, date) { return this.call('save_activity_log', { work_done, date }); },
  getActivityHistory(month, year) { return this.call('get_activity_history', { month, year }); },
  getLeaveBalance() { return this.call('get_leave_balance'); },
  submitLeaveRequest(args) { return this.call('submit_leave_request', args); },
  submitAttendanceRequest(args) { return this.call('submit_attendance_request', args); },
  getMyRequests() { return this.call('get_my_requests'); },
  submitExpenseClaim(expenses, project, remark) { return this.call('submit_expense_claim', { expenses, project, remark }); },
  getExpenseHistory() { return this.call('get_expense_history'); },
  getSalarySlips() { return this.call('get_salary_slips'); },
  getSalarySlipDetail(slip_name) { return this.call('get_salary_slip_detail', { slip_name }); }
};

// ==========================================
// Global Reactive State & Toast Helper
// ==========================================
const globalState = reactive({
  user: null,
  employeeInfo: null,
  todayStatus: null,
  toast: { show: false, message: '', type: 'info' }
});

const showToast = (message, type = 'info') => {
  globalState.toast = { show: true, message, type };
  setTimeout(() => { globalState.toast.show = false; }, 3500);
};

const refreshIcons = () => {
  nextTick(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });
};

const getGPSLocation = () => {
  return new Promise((resolve) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.warn('Geolocation fallback:', err.message);
          resolve({ lat: 31.1048, lng: 77.1734 }); // Head office default
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      resolve({ lat: 31.1048, lng: 77.1734 });
    }
  });
};

// ==========================================
// Reusable Components
// ==========================================
const BottomNav = {
  template: `
    <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 shadow-lg px-2">
      <router-link to="/home" class="flex flex-col items-center flex-1 py-1 text-gray-500 transition-colors" active-class="text-blue-600 font-semibold">
        <i data-lucide="home" class="w-5 h-5"></i>
        <span class="text-[11px] mt-1">Home</span>
      </router-link>
      <router-link to="/history" class="flex flex-col items-center flex-1 py-1 text-gray-500 transition-colors" active-class="text-blue-600 font-semibold">
        <i data-lucide="history" class="w-5 h-5"></i>
        <span class="text-[11px] mt-1">History</span>
      </router-link>
      <router-link to="/profile" class="flex flex-col items-center flex-1 py-1 text-gray-500 transition-colors" active-class="text-blue-600 font-semibold">
        <i data-lucide="user" class="w-5 h-5"></i>
        <span class="text-[11px] mt-1">Profile</span>
      </router-link>
    </nav>
  `,
  mounted() { refreshIcons(); }
};

// ==========================================
// Views / Screens
// ==========================================

// 1. LOGIN VIEW
const LoginView = {
  template: `
    <div class="min-h-screen flex flex-col justify-center items-center px-4 bg-gradient-to-b from-blue-50 to-gray-100">
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
            <input v-model="email" type="text" required placeholder="name@candeconsultancy.in" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Password</label>
            <input v-model="password" type="password" required placeholder="••••••••" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm">
          </div>
          <button type="submit" :disabled="loading" class="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl shadow-md hover:bg-blue-700 transition flex justify-center items-center">
            <span v-if="loading" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
            <span>Sign In</span>
          </button>
        </form>
      </div>
      <p class="text-xs text-gray-400 mt-6">C and E Consultancy Private Limited</p>
    </div>
  `,
  setup() {
    const router = useRouter();
    const email = ref('');
    const password = ref('');
    const loading = ref(false);

    const handleLogin = async () => {
      loading.value = true;
      try {
        const res = await API.login(email.value, password.value);
        if (res.message === 'Logged In') {
          showToast('Welcome back!', 'success');
          router.push('/home');
        } else {
          showToast('Invalid email or password', 'error');
        }
      } catch (e) {
        showToast('Login failed. Please check credentials.', 'error');
      } finally {
        loading.value = false;
      }
    };

    return { email, password, loading, handleLogin };
  }
};

// 2. HOME VIEW
const HomeView = {
  template: `
    <div class="min-h-screen bg-gray-50 pb-20">
      <!-- Top Header -->
      <div class="bg-blue-600 text-white px-5 pt-8 pb-12 rounded-b-3xl shadow-md">
        <div class="flex justify-between items-center mb-3">
          <div>
            <p class="text-blue-100 text-xs font-medium uppercase tracking-wider">Welcome Back</p>
            <h2 class="text-xl font-bold">{{ globalState.employeeInfo?.employee_name || 'Loading...' }}</h2>
            <p class="text-xs text-blue-200">{{ globalState.employeeInfo?.designation || '' }}</p>
          </div>
          <div class="w-11 h-11 bg-blue-500 rounded-full flex items-center justify-center font-bold text-base border-2 border-blue-400">
            {{ (globalState.employeeInfo?.employee_name || 'E').charAt(0) }}
          </div>
        </div>
      </div>

      <!-- Main Container Floating Card -->
      <div class="px-4 -mt-8 space-y-4">
        <!-- Check In / Check Out Status Card -->
        <div class="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 rounded-full animate-pulse" :class="statusClass"></span>
              <span class="text-sm font-bold text-gray-800">{{ statusText }}</span>
            </div>
            <span class="text-xs text-gray-500">{{ todayFormatted }}</span>
          </div>

          <!-- Primary Action Button -->
          <button 
            v-if="!todayStatus?.checked_in"
            @click="handleCheckIn" 
            :disabled="actionLoading"
            class="w-full py-4 bg-emerald-600 text-white font-bold text-base rounded-xl shadow-md hover:bg-emerald-700 transition flex items-center justify-center space-x-2">
            <span v-if="actionLoading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
            <i data-lucide="log-in" class="w-5 h-5"></i>
            <span>Check In Now</span>
          </button>

          <div v-else class="space-y-2">
            <div class="bg-emerald-50 text-emerald-800 text-xs p-2.5 rounded-lg flex items-center justify-between">
              <span>In Time: <strong>{{ formatTime(todayStatus?.checked_in_time) }}</strong></span>
              <span v-if="todayStatus?.activity_logged" class="text-emerald-700 font-semibold">✓ Activity Logged</span>
              <span v-else class="text-amber-700 font-semibold">⚠ Activity Pending</span>
            </div>

            <button 
              @click="goCheckOut"
              :disabled="actionLoading"
              class="w-full py-3.5 bg-rose-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-rose-700 transition flex items-center justify-center space-x-2">
              <i data-lucide="log-out" class="w-5 h-5"></i>
              <span>Check Out (Submit Activity)</span>
            </button>
          </div>
        </div>

        <!-- 6 Quick Actions Grid -->
        <div>
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">Quick Actions</h3>
          <div class="grid grid-cols-2 gap-3">
            <!-- 1. Activity Log -->
            <router-link to="/activity" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
              <div class="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center mb-3">
                <i data-lucide="file-text" class="w-5 h-5"></i>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm">Activity Log</p>
                <p class="text-[11px] text-gray-500">Record daily work</p>
              </div>
            </router-link>

            <!-- 2. Apply Leave -->
            <router-link to="/leave" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
              <div class="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center mb-3">
                <i data-lucide="calendar" class="w-5 h-5"></i>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm">Apply Leave</p>
                <p class="text-[11px] text-gray-500">Casual / Earned</p>
              </div>
            </router-link>

            <!-- 3. Work From Home -->
            <router-link to="/attendance-req?reason=Work From Home" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
              <div class="w-10 h-10 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center mb-3">
                <i data-lucide="home" class="w-5 h-5"></i>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm">Work From Home</p>
                <p class="text-[11px] text-gray-500">Submit WFH request</p>
              </div>
            </router-link>

            <!-- 4. Add Overtime -->
            <router-link to="/attendance-req?reason=Overtime" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
              <div class="w-10 h-10 bg-orange-100 text-orange-700 rounded-xl flex items-center justify-center mb-3">
                <i data-lucide="clock" class="w-5 h-5"></i>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm">Add Overtime</p>
                <p class="text-[11px] text-gray-500">Log overtime hours</p>
              </div>
            </router-link>

            <!-- 5. Claim Expense -->
            <router-link to="/expense" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
              <div class="w-10 h-10 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center mb-3">
                <i data-lucide="receipt" class="w-5 h-5"></i>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm">Claim Expense</p>
                <p class="text-[11px] text-gray-500">Fuel, food, stay</p>
              </div>
            </router-link>

            <!-- 6. Salary Slips -->
            <router-link to="/salary" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
              <div class="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center mb-3">
                <i data-lucide="wallet" class="w-5 h-5"></i>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm">Salary Slips</p>
                <p class="text-[11px] text-gray-500">Monthly payslips</p>
              </div>
            </router-link>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  `,
  components: { BottomNav },
  setup() {
    const router = useRouter();
    const actionLoading = ref(false);
    const todayStatus = computed(() => globalState.todayStatus);

    const todayFormatted = computed(() => {
      return new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
    });

    const statusText = computed(() => {
      if (!todayStatus.value?.checked_in) return 'Not Checked In';
      if (todayStatus.value?.checked_out) return 'Checked Out Today';
      return 'Currently Checked In';
    });

    const statusClass = computed(() => {
      if (!todayStatus.value?.checked_in) return 'bg-gray-400';
      if (todayStatus.value?.checked_out) return 'bg-blue-500';
      return 'bg-emerald-500';
    });

    const formatTime = (timeStr) => {
      if (!timeStr) return '';
      const d = new Date(timeStr);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    const loadData = async () => {
      try {
        globalState.employeeInfo = await API.getEmployeeInfo();
        globalState.todayStatus = await API.getTodayStatus();
      } catch (e) {
        console.warn('Load error, redirecting to login:', e);
        router.push('/');
      }
      refreshIcons();
    };

    const handleCheckIn = async () => {
      actionLoading.value = true;
      try {
        const coords = await getGPSLocation();
        await API.markCheckin(coords.lat, coords.lng);
        showToast('Checked In successfully!', 'success');
        await loadData();
      } catch (e) {
        showToast(e.message || 'Check-in failed', 'error');
      } finally {
        actionLoading.value = false;
      }
    };

    const goCheckOut = () => {
      router.push('/checkout');
    };

    onMounted(loadData);

    return {
      globalState,
      todayStatus,
      todayFormatted,
      statusText,
      statusClass,
      actionLoading,
      formatTime,
      handleCheckIn,
      goCheckOut
    };
  }
};

// 3. CHECK-OUT VIEW (MANDATORY ACTIVITY LOG FIRST)
const CheckOutView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <div class="flex items-center mb-4">
        <button @click="$router.back()" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
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
          <input type="text" :value="todayStr" readonly class="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Daily Work Done / Activity Details *</label>
          <textarea 
            v-model="workDone" 
            rows="6" 
            required 
            placeholder="Describe tasks completed, site visits, design sheets, client meetings, etc..." 
            class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none text-sm leading-relaxed"></textarea>
        </div>

        <button 
          @click="submitCheckOut" 
          :disabled="loading || !workDone.trim()"
          class="w-full py-4 bg-rose-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-rose-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
          <span v-if="loading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
          <i data-lucide="check-circle" class="w-5 h-5"></i>
          <span>Save Activity & Confirm Check Out</span>
        </button>
      </div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const workDone = ref('');
    const loading = ref(false);
    const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const submitCheckOut = async () => {
      if (!workDone.value.trim()) {
        showToast('Daily activity summary is mandatory before checking out.', 'error');
        return;
      }
      loading.value = true;
      try {
        // Step 1: Save Activity Log
        await API.saveActivityLog(workDone.value.trim());
        // Step 2: Mark Check Out with GPS
        const coords = await getGPSLocation();
        await API.markCheckout(coords.lat, coords.lng);
        
        showToast('Work logged and Checked Out successfully!', 'success');
        router.push('/home');
      } catch (e) {
        showToast(e.message || 'Error during checkout', 'error');
      } finally {
        loading.value = false;
      }
    };

    onMounted(refreshIcons);

    return { workDone, loading, todayStr, submitCheckOut };
  }
};

// 4. ACTIVITY LOG VIEW
const ActivityLogView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <div class="flex items-center mb-4">
        <button @click="$router.back()" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-900">Add Daily Activity Log</h2>
      </div>

      <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
          <input type="text" :value="todayStr" readonly class="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Daily Work Done / Remarks *</label>
          <textarea 
            v-model="workDone" 
            rows="6" 
            placeholder="Type your daily accomplishments, project updates, or notes..." 
            class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm leading-relaxed"></textarea>
        </div>

        <button 
          @click="saveLog" 
          :disabled="loading || !workDone.trim()"
          class="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
          <span v-if="loading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
          <i data-lucide="save" class="w-5 h-5"></i>
          <span>Save Daily Activity</span>
        </button>
      </div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const workDone = ref('');
    const loading = ref(false);
    const todayStr = new Date().toLocaleDateString('en-CA');

    const saveLog = async () => {
      loading.value = true;
      try {
        await API.saveActivityLog(workDone.value.trim());
        showToast('Activity log saved successfully!', 'success');
        router.push('/home');
      } catch (e) {
        showToast(e.message || 'Error saving activity log', 'error');
      } finally {
        loading.value = false;
      }
    };

    onMounted(refreshIcons);

    return { workDone, loading, todayStr, saveLog };
  }
};

// 5. LEAVE REQUEST VIEW
const LeaveRequestView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <div class="flex items-center mb-4">
        <button @click="$router.back()" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-900">Apply for Leave</h2>
      </div>

      <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Leave Type</label>
          <select v-model="form.leave_type" class="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium">
            <option value="Casual Leave">Casual Leave</option>
            <option value="Earned Leave">Earned Leave</option>
            <option value="Leave Without Pay">Leave Without Pay (LWP)</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-gray-700 uppercase mb-1">From Date</label>
            <input type="date" v-model="form.from_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-700 uppercase mb-1">To Date</label>
            <input type="date" v-model="form.to_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <input type="checkbox" id="half_day" v-model="form.half_day" class="w-4 h-4 text-blue-600 rounded">
          <label for="half_day" class="text-sm font-medium text-gray-700">Half Day Leave</label>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Reason for Leave *</label>
          <textarea v-model="form.reason" rows="4" required placeholder="Please provide reason..." class="w-full p-3 border border-gray-300 rounded-xl text-sm"></textarea>
        </div>

        <button 
          @click="submit" 
          :disabled="loading || !form.reason.trim()"
          class="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
          <span v-if="loading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>Submit Leave Application</span>
        </button>
      </div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const loading = ref(false);
    const today = new Date().toLocaleDateString('en-CA');
    const form = reactive({
      leave_type: 'Casual Leave',
      from_date: today,
      to_date: today,
      half_day: 0,
      reason: ''
    });

    const submit = async () => {
      loading.value = true;
      try {
        await API.submitLeaveRequest({
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
          reason: form.reason,
          half_day: form.half_day ? 1 : 0
        });
        showToast('Leave application submitted to reporting manager!', 'success');
        router.push('/home');
      } catch (e) {
        showToast(e.message || 'Failed to submit leave', 'error');
      } finally {
        loading.value = false;
      }
    };

    onMounted(refreshIcons);

    return { form, loading, submit };
  }
};

// 6. ATTENDANCE REQUEST VIEW (WFH & OVERTIME)
const AttendanceRequestView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <div class="flex items-center mb-4">
        <button @click="$router.back()" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-900">{{ form.reason }} Request</h2>
      </div>

      <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Request Type</label>
          <select v-model="form.reason" class="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium">
            <option value="Work From Home">Work From Home (WFH)</option>
            <option value="Overtime">Overtime</option>
            <option value="On Duty">On Duty (Site Visit)</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-gray-700 uppercase mb-1">From Date</label>
            <input type="date" v-model="form.from_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-700 uppercase mb-1">To Date</label>
            <input type="date" v-model="form.to_date" required class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Explanation / Hours / Remarks *</label>
          <textarea v-model="form.explanation" rows="4" required :placeholder="form.reason === 'Overtime' ? 'Specify overtime hours worked and task details...' : 'Describe reason for WFH...'" class="w-full p-3 border border-gray-300 rounded-xl text-sm"></textarea>
        </div>

        <button 
          @click="submit" 
          :disabled="loading || !form.explanation.trim()"
          class="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
          <span v-if="loading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
          <span>Submit Request</span>
        </button>
      </div>
    </div>
  `,
  setup() {
    const route = useRoute();
    const router = useRouter();
    const loading = ref(false);
    const today = new Date().toLocaleDateString('en-CA');

    const form = reactive({
      reason: route.query.reason || 'Work From Home',
      from_date: today,
      to_date: today,
      explanation: ''
    });

    const submit = async () => {
      loading.value = true;
      try {
        await API.submitAttendanceRequest({
          reason: form.reason,
          from_date: form.from_date,
          to_date: form.to_date,
          explanation: form.explanation
        });
        showToast(`${form.reason} request submitted!`, 'success');
        router.push('/home');
      } catch (e) {
        showToast(e.message || 'Submission failed', 'error');
      } finally {
        loading.value = false;
      }
    };

    onMounted(refreshIcons);

    return { form, loading, submit };
  }
};

// 7. EXPENSE CLAIM VIEW
const ExpenseClaimView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <div class="flex items-center mb-4">
        <button @click="$router.back()" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-900">Claim Expense</h2>
      </div>

      <div class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Expense Category</label>
          <select v-model="item.expense_type" class="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium">
            <option value="Fuel Expense">Fuel Expense</option>
            <option value="Food Expense">Food Expense</option>
            <option value="Boarding & Lodging">Boarding & Lodging (Hotel/Stay)</option>
            <option value="Local Conveyance">Local Conveyance / Travel</option>
            <option value="Other Expenses">Other Misc Expense</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Claim Amount (₹ INR) *</label>
          <input type="number" step="any" v-model="item.amount" required placeholder="e.g. 1500" class="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold">
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Description / Bill Details</label>
          <input type="text" v-model="item.description" placeholder="e.g. Site fuel receipt, highway toll" class="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm">
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Non-Project Remarks (if no project)</label>
          <textarea v-model="remark" rows="2" placeholder="Local office run, vehicle maintenance note..." class="w-full p-2.5 border border-gray-300 rounded-xl text-sm"></textarea>
        </div>

        <button 
          @click="submit" 
          :disabled="loading || !item.amount"
          class="w-full py-3.5 bg-purple-600 text-white font-bold text-sm rounded-xl shadow-md hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center space-x-2">
          <span v-if="loading" class="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
          <i data-lucide="send" class="w-5 h-5"></i>
          <span>Submit Expense Claim</span>
        </button>
      </div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const loading = ref(false);
    const item = reactive({
      expense_type: 'Fuel Expense',
      amount: '',
      description: ''
    });
    const remark = ref('');

    const submit = async () => {
      if (!item.amount || Number(item.amount) <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }
      loading.value = true;
      try {
        await API.submitExpenseClaim([item], null, remark.value);
        showToast('Expense claim submitted for approval!', 'success');
        router.push('/home');
      } catch (e) {
        showToast(e.message || 'Submission failed', 'error');
      } finally {
        loading.value = false;
      }
    };

    onMounted(refreshIcons);

    return { item, remark, loading, submit };
  }
};

// 8. SALARY SLIPS VIEW
const SalarySlipsView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <div class="flex items-center mb-4">
        <button @click="$router.back()" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-900">My Salary Slips</h2>
      </div>

      <div v-if="loading" class="flex justify-center py-12">
        <span class="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full"></span>
      </div>

      <div v-else-if="slips.length" class="space-y-3">
        <div 
          v-for="slip in slips" 
          :key="slip.name" 
          @click="openSlip(slip.name)"
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
  `,
  setup() {
    const router = useRouter();
    const loading = ref(true);
    const slips = ref([]);

    const formatMonth = (dateStr) => {
      if (!dateStr) return 'Salary Slip';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };

    const openSlip = (name) => {
      router.push(`/salary/${name}`);
    };

    onMounted(async () => {
      try {
        slips.value = await API.getSalarySlips();
      } catch (e) {
        showToast('Error loading salary slips', 'error');
      } finally {
        loading.value = false;
        refreshIcons();
      }
    });

    return { loading, slips, formatMonth, openSlip };
  }
};

// 9. SALARY DETAIL VIEW (1-PAGE FORMAT)
const SalaryDetailView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center">
          <button @click="$router.back()" class="p-2 -ml-2 mr-2 text-gray-600"><i data-lucide="arrow-left"></i></button>
          <h2 class="text-lg font-bold text-gray-900">Salary Slip</h2>
        </div>
        <button @click="printSlip" class="text-xs bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1">
          <i data-lucide="printer" class="w-3.5 h-3.5"></i>
          <span>Print / PDF</span>
        </button>
      </div>

      <div v-if="loading" class="flex justify-center py-12">
        <span class="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full"></span>
      </div>

      <div v-else-if="slip" class="bg-white rounded-2xl p-5 shadow-md border border-gray-100 space-y-4">
        <!-- Company Header -->
        <div class="text-center border-b pb-3">
          <h3 class="font-bold text-gray-900 text-base">C&E CONSULTANCY PRIVATE LIMITED</h3>
          <p class="text-xs text-gray-500">Salary Slip for {{ formatMonth(slip.start_date) }}</p>
        </div>

        <!-- Employee Info Grid -->
        <div class="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl">
          <div><span class="text-gray-500">Employee:</span> <strong class="text-gray-800">{{ slip.employee_name }}</strong></div>
          <div><span class="text-gray-500">Emp ID:</span> <strong class="text-gray-800">{{ slip.employee }}</strong></div>
          <div><span class="text-gray-500">Designation:</span> <strong class="text-gray-800">{{ slip.designation }}</strong></div>
          <div><span class="text-gray-500">Department:</span> <strong class="text-gray-800">{{ slip.department }}</strong></div>
          <div><span class="text-gray-500">Bank A/c:</span> <strong class="text-gray-800">{{ slip.bank_account_no || 'On Record' }}</strong></div>
          <div><span class="text-gray-500">IFSC:</span> <strong class="text-gray-800">{{ slip.ifsc_code || 'On Record' }}</strong></div>
        </div>

        <!-- Earnings Breakdown -->
        <div>
          <h4 class="text-xs font-bold text-gray-700 uppercase mb-2 border-b pb-1">Earnings</h4>
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between"><span>Basic Salary</span><strong>₹{{ fmt(slip.custom_base_gross || slip.gross_pay) }}</strong></div>
            <div v-if="slip.custom_overtime_payment" class="flex justify-between text-blue-700"><span>Overtime Payment ({{ slip.custom_overtime_hours }} hrs)</span><strong>₹{{ fmt(slip.custom_overtime_payment) }}</strong></div>
            <div v-if="slip.custom_extra_day_payment" class="flex justify-between text-blue-700"><span>Extra Days Payment ({{ slip.custom_extra_working_days }} days)</span><strong>₹{{ fmt(slip.custom_extra_day_payment) }}</strong></div>
            <div v-if="slip.custom_fuel_expense" class="flex justify-between"><span>Fuel Reimbursement</span><strong>₹{{ fmt(slip.custom_fuel_expense) }}</strong></div>
            <div v-if="slip.custom_food_expense" class="flex justify-between"><span>Food Reimbursement</span><strong>₹{{ fmt(slip.custom_food_expense) }}</strong></div>
            <div v-if="slip.custom_misc_expense" class="flex justify-between"><span>Boarding & Lodging / Misc</span><strong>₹{{ fmt(slip.custom_misc_expense) }}</strong></div>
          </div>
        </div>

        <!-- Deductions Breakdown -->
        <div>
          <h4 class="text-xs font-bold text-gray-700 uppercase mb-2 border-b pb-1">Deductions</h4>
          <div class="space-y-1.5 text-xs">
            <div v-if="slip.custom_leave_deductions || slip.absent_days" class="flex justify-between text-rose-700"><span>Leave Deductions</span><strong>-₹{{ fmt(slip.custom_leave_deductions) }}</strong></div>
            <div v-if="slip.custom_advances" class="flex justify-between text-rose-700"><span>Advance Deduction</span><strong>-₹{{ fmt(slip.custom_advances) }}</strong></div>
            <div v-if="!slip.custom_leave_deductions && !slip.custom_advances" class="text-gray-400 italic">No deductions this month</div>
          </div>
        </div>

        <!-- Net Total Summary Box -->
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex justify-between items-center">
          <div>
            <p class="text-xs text-emerald-800 font-semibold uppercase">Total Net Payable</p>
            <p class="text-[11px] text-emerald-600">Transferred to Bank Account</p>
          </div>
          <div class="text-xl font-black text-emerald-700">
            ₹{{ fmt(slip.net_pay) }}
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const route = useRoute();
    const loading = ref(true);
    const slip = ref(null);

    const fmt = (val) => Number(val || 0).toLocaleString('en-IN');
    const formatMonth = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };

    const printSlip = () => {
      window.open(`/api/method/frappe.utils.print_format.download_pdf?doctype=Salary+Slip&name=${route.params.id}&format=Detailed+Salary+Slip`, '_blank');
    };

    onMounted(async () => {
      try {
        slip.value = await API.getSalarySlipDetail(route.params.id);
      } catch (e) {
        showToast('Error loading slip detail', 'error');
      } finally {
        loading.value = false;
        refreshIcons();
      }
    });

    return { loading, slip, fmt, formatMonth, printSlip };
  }
};

// 10. HISTORY VIEW
const HistoryView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <h2 class="text-lg font-bold text-gray-900 mb-4">My History</h2>

      <!-- Tab Buttons -->
      <div class="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-4">
        <button @click="tab = 'activity'" :class="tab === 'activity' ? 'bg-blue-600 text-white font-bold' : 'text-gray-600'" class="flex-1 py-2 text-xs rounded-lg transition">Activity Logs</button>
        <button @click="tab = 'requests'" :class="tab === 'requests' ? 'bg-blue-600 text-white font-bold' : 'text-gray-600'" class="flex-1 py-2 text-xs rounded-lg transition">Requests</button>
      </div>

      <div v-if="loading" class="flex justify-center py-12">
        <span class="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full"></span>
      </div>

      <!-- Tab 1: Activity Logs -->
      <div v-else-if="tab === 'activity'" class="space-y-3">
        <div v-for="log in activities" :key="log.name" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div class="flex justify-between items-center mb-1.5">
            <span class="font-bold text-xs text-blue-700">{{ log.date }}</span>
            <span class="text-[10px] text-gray-400">{{ log.name }}</span>
          </div>
          <p class="text-xs text-gray-800 whitespace-pre-line leading-relaxed">{{ log.work_done }}</p>
        </div>
        <div v-if="!activities.length" class="text-center py-12 text-gray-400 text-sm">No activity logs recorded yet.</div>
      </div>

      <!-- Tab 2: Requests -->
      <div v-else-if="tab === 'requests'" class="space-y-3">
        <div v-for="req in requests.leaves" :key="req.name" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <p class="font-bold text-xs text-gray-900">{{ req.leave_type }}</p>
            <p class="text-[11px] text-gray-500">{{ req.from_date }} to {{ req.to_date }}</p>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold" :class="req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">{{ req.status }}</span>
        </div>

        <div v-for="req in requests.attendance" :key="req.name" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <p class="font-bold text-xs text-gray-900">{{ req.reason }}</p>
            <p class="text-[11px] text-gray-500">{{ req.from_date }} to {{ req.to_date }}</p>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold" :class="req.docstatus === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">{{ req.docstatus === 1 ? 'Approved' : 'Pending' }}</span>
        </div>

        <div v-if="!requests.leaves?.length && !requests.attendance?.length" class="text-center py-12 text-gray-400 text-sm">No requests found.</div>
      </div>

      <BottomNav />
    </div>
  `,
  components: { BottomNav },
  setup() {
    const tab = ref('activity');
    const loading = ref(true);
    const activities = ref([]);
    const requests = ref({ leaves: [], attendance: [] });

    onMounted(async () => {
      try {
        activities.value = await API.getActivityHistory();
        requests.value = await API.getMyRequests();
      } catch (e) {
        console.warn(e);
      } finally {
        loading.value = false;
        refreshIcons();
      }
    });

    return { tab, loading, activities, requests };
  }
};

// 11. PROFILE VIEW
const ProfileView = {
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <h2 class="text-lg font-bold text-gray-900 mb-4">My Profile</h2>

      <div class="bg-white rounded-2xl p-6 shadow-md border border-gray-100 flex flex-col items-center text-center mb-4">
        <div class="w-20 h-20 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-2xl border-4 border-white shadow-sm mb-3">
          {{ (globalState.employeeInfo?.employee_name || 'E').charAt(0) }}
        </div>
        <h3 class="font-bold text-gray-900 text-base">{{ globalState.employeeInfo?.employee_name }}</h3>
        <p class="text-xs text-blue-600 font-semibold">{{ globalState.employeeInfo?.designation }}</p>
        <p class="text-[11px] text-gray-500 mt-0.5">{{ globalState.employeeInfo?.department }}</p>
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

      <BottomNav />
    </div>
  `,
  components: { BottomNav },
  setup() {
    const leaveBalances = ref([]);

    const handleSignOut = () => {
      API.logout();
    };

    onMounted(async () => {
      try {
        if (!globalState.employeeInfo) {
          globalState.employeeInfo = await API.getEmployeeInfo();
        }
        leaveBalances.value = await API.getLeaveBalance();
      } catch (e) {
        console.warn(e);
      }
      refreshIcons();
    });

    return { globalState, leaveBalances, handleSignOut };
  }
};

// ==========================================
// Router Configuration
// ==========================================
const routes = [
  { path: '/', component: LoginView },
  { path: '/home', component: HomeView },
  { path: '/checkout', component: CheckOutView },
  { path: '/activity', component: ActivityLogView },
  { path: '/leave', component: LeaveRequestView },
  { path: '/attendance-req', component: AttendanceRequestView },
  { path: '/expense', component: ExpenseClaimView },
  { path: '/salary', component: SalarySlipsView },
  { path: '/salary/:id', component: SalaryDetailView },
  { path: '/history', component: HistoryView },
  { path: '/profile', component: ProfileView }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// Navigation Guard
router.beforeEach(async (to, from, next) => {
  if (to.path !== '/') {
    try {
      if (!globalState.employeeInfo) {
        globalState.employeeInfo = await API.getEmployeeInfo();
      }
      next();
    } catch (e) {
      next('/');
    }
  } else {
    next();
  }
});

// ==========================================
// Root Application Mounting
// ==========================================
const App = {
  template: `
    <div id="app" class="font-sans antialiased">
      <!-- Toast Notification -->
      <transition name="toast">
        <div 
          v-if="globalState.toast.show" 
          class="fixed top-4 left-4 right-4 z-50 p-3.5 rounded-xl text-white text-xs font-semibold shadow-xl flex items-center justify-between"
          :class="{
            'bg-emerald-600': globalState.toast.type === 'success',
            'bg-rose-600': globalState.toast.type === 'error',
            'bg-blue-600': globalState.toast.type === 'info'
          }">
          <span>{{ globalState.toast.message }}</span>
          <button @click="globalState.toast.show = false" class="text-white/80 ml-2">✕</button>
        </div>
      </transition>

      <router-view></router-view>
    </div>
  `,
  setup() {
    return { globalState };
  }
};

const app = createApp(App);
app.use(router);
app.mount('#app');
