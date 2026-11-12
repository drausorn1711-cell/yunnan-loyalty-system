// Central API Client & Utility Functions
const API_BASE = window.location.origin;

const api = {
  // Get Stats
  async getStats() {
    const res = await fetch(`${API_BASE}/api/stats`);
    return await res.json();
  },

  // Get Store Settings
  async getSettings() {
    const res = await fetch(`${API_BASE}/api/settings`);
    return await res.json();
  },

  // Update Settings
  async saveSettings(data) {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  // Get Members
  async getMembers(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/api/members?${query}`);
    return await res.json();
  },

  // Get Single Member Profile
  async getMember(idOrPhone) {
    const res = await fetch(`${API_BASE}/api/members/${encodeURIComponent(idOrPhone)}`);
    return await res.json();
  },

  // Add Member
  async addMember(data) {
    const res = await fetch(`${API_BASE}/api/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  // Update Member
  async updateMember(id, data) {
    const res = await fetch(`${API_BASE}/api/members/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  // Delete Member
  async deleteMember(id) {
    const res = await fetch(`${API_BASE}/api/members/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  // Manual Adjust Points
  async adjustPoints(memberId, points, type, reason) {
    const res = await fetch(`${API_BASE}/api/members/${memberId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points, type, reason })
    });
    return await res.json();
  },

  // POS Earn Points
  async posEarnPoints(data) {
    const res = await fetch(`${API_BASE}/api/pos/earn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  // Get Rewards
  async getRewards(activeOnly = false) {
    const res = await fetch(`${API_BASE}/api/rewards?active_only=${activeOnly}`);
    return await res.json();
  },

  // Create Reward
  async addReward(data) {
    const res = await fetch(`${API_BASE}/api/rewards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  // Update Reward
  async updateReward(id, data) {
    const res = await fetch(`${API_BASE}/api/rewards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  // Delete Reward
  async deleteReward(id) {
    const res = await fetch(`${API_BASE}/api/rewards/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  // Redeem Reward
  async redeemReward(memberId, rewardId) {
    const res = await fetch(`${API_BASE}/api/rewards/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, reward_id: rewardId })
    });
    return await res.json();
  },

  // Get Redemptions
  async getRedemptions(status = '') {
    const res = await fetch(`${API_BASE}/api/redemptions?status=${status}`);
    return await res.json();
  },

  // Verify Voucher
  async verifyVoucher(voucherCode) {
    const res = await fetch(`${API_BASE}/api/redemptions/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voucher_code: voucherCode })
    });
    return await res.json();
  },

  // Get Transactions
  async getTransactions(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/api/transactions?${query}`);
    return await res.json();
  }
};

// Utilities & Formatting
const utils = {
  formatNumber(num) {
    return Number(num || 0).toLocaleString('th-TH');
  },

  formatCurrency(num) {
    return '฿' + Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  },

  getTierBadgeHtml(tier) {
    const map = {
      Silver: '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold badge-tier-silver"><i class="fa-solid fa-award mr-1"></i>Silver</span>',
      Gold: '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold badge-tier-gold"><i class="fa-solid fa-crown mr-1"></i>Gold</span>',
      Platinum: '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold badge-tier-platinum"><i class="fa-solid fa-gem mr-1"></i>Platinum</span>',
      Diamond: '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold badge-tier-diamond"><i class="fa-solid fa-sparkles mr-1"></i>Diamond</span>'
    };
    return map[tier] || `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">${tier}</span>`;
  },

  // Web Audio API Chime & Success Sound
  playSuccessSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      // Two-tone bell chord
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5
      osc.frequency.setValueAtTime(1174.66, now + 0.2); // D6

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {
      console.warn('AudioContext not allowed or supported', e);
    }
  },

  // Launch celebratory confetti
  fireConfetti() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  },

  // Copy text to clipboard
  async copyText(text, message = 'คัดลอกลิงก์สำเร็จ!') {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: message,
          showConfirmButton: false,
          timer: 2000
        });
      } else {
        alert(message);
      }
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert(message);
    }
  }
};
