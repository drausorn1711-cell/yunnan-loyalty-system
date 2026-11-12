// Customer Member Portal & Digital Card Logic
let currentMember = null;
let currentSettings = null;
let allMembers = [];
let availableRewards = [];

let lineProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initPortal();
});

async function initPortal() {
  try {
    const setRes = await api.getSettings();
    if (setRes.success) {
      currentSettings = setRes.settings;
      document.getElementById('customerStoreName').innerText = currentSettings.store_name;
      document.getElementById('cardStoreTag').innerText = currentSettings.store_name.slice(0, 16);
    }

    // Try LINE LIFF Initialization if running in LINE
    if (typeof liff !== 'undefined') {
      try {
        const liffUrl = currentSettings?.liff_url || '';
        // Extract LIFF ID if URL format is https://liff.line.me/XXXX-YYYY
        const match = liffUrl.match(/liff\.line\.me\/([a-zA-Z0-9_-]+)/);
        const liffId = match ? match[1] : null;

        if (liffId) {
          await liff.init({ liffId });
          if (liff.isLoggedIn()) {
            lineProfile = await liff.getProfile();
            console.log('LINE User Profile:', lineProfile);
          }
        }
      } catch (liffErr) {
        console.warn('LIFF init notice:', liffErr);
      }
    }

    // Load all members for demo switcher
    const memRes = await api.getMembers();
    if (memRes.success) {
      allMembers = memRes.members;
      populateMemberSelector(allMembers);
    }

    // Check if LINE Profile matches any registered member
    let matchedMember = null;
    if (lineProfile) {
      matchedMember = allMembers.find(m => m.notes && m.notes.includes(lineProfile.userId));
      if (!matchedMember && lineProfile.displayName) {
        matchedMember = allMembers.find(m => m.name.toLowerCase() === lineProfile.displayName.toLowerCase());
      }
    }

    // Determine which member to load
    const urlParams = new URLSearchParams(window.location.search);
    const phoneParam = urlParams.get('phone') || urlParams.get('code') || localStorage.getItem('last_member_phone');

    if (matchedMember) {
      await loadMemberProfile(matchedMember.phone);
    } else if (phoneParam) {
      await loadMemberProfile(phoneParam);
    } else if (allMembers.length > 0) {
      await loadMemberProfile(allMembers[0].phone);
    } else {
      // Empty system: Show self-registration view
      showRegisterView();
      if (lineProfile) {
        document.getElementById('custRegName').value = lineProfile.displayName || '';
      }
    }

    // Load rewards catalog
    await loadCustomerRewards();
  } catch (err) {
    console.error('Error initializing customer portal:', err);
  }
}

function showRegisterView() {
  document.getElementById('customerRegisterView').classList.remove('hidden');
  document.getElementById('customerCardContainer').classList.add('hidden');
}

function showCardView() {
  document.getElementById('customerRegisterView').classList.add('hidden');
  document.getElementById('customerCardContainer').classList.remove('hidden');
}

async function handleCustomerSelfRegister(e) {
  e.preventDefault();
  const name = document.getElementById('custRegName').value.trim();
  const phone = document.getElementById('custRegPhone').value.trim();

  try {
    const res = await api.addMember({ name, phone, initial_points: 0 });
    if (res.success) {
      utils.playSuccessSound();
      utils.fireConfetti();
      await Swal.fire({
        icon: 'success',
        title: 'เปิดบัตรสมาชิกสำเร็จ!',
        text: `ยินดีต้อนรับคุณ ${res.member.name}`,
        timer: 2000,
        showConfirmButton: false
      });

      // Reload all members and select new member
      const memRes = await api.getMembers();
      if (memRes.success) {
        allMembers = memRes.members;
        populateMemberSelector(allMembers);
      }
      showCardView();
      await loadMemberProfile(res.member.phone);
    } else {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  }
}

function populateMemberSelector(members) {
  const sel = document.getElementById('memberSelector');
  if (members.length === 0) {
    sel.innerHTML = `<option value="">(ยังไม่มีสมาชิก)</option>`;
    return;
  }
  sel.innerHTML = members.map(m => `
    <option value="${m.phone}">${m.name} (${m.tier})</option>
  `).join('');
}

function changeMember(phone) {
  if (!phone) return;
  showCardView();
  loadMemberProfile(phone);
}

async function promptLogin() {
  const { value: phone } = await Swal.fire({
    title: 'เข้าสู่ระบบด้วยเบอร์โทร',
    input: 'tel',
    inputLabel: 'กรอกเบอร์โทรศัพท์สมาชิก',
    inputPlaceholder: 'เช่น 0812345678',
    showCancelButton: true,
    confirmButtonText: 'เข้าสู่ระบบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#064e3b'
  });

  if (phone) {
    showCardView();
    await loadMemberProfile(phone);
  }
}

// --------------------------------------------------
// LOAD & RENDER MEMBER PROFILE
// --------------------------------------------------
async function loadMemberProfile(idOrPhone) {
  try {
    const res = await api.getMember(idOrPhone);
    if (!res.success) {
      Swal.fire({
        icon: 'info',
        title: 'ยังไม่พบข้อมูลสมาชิก',
        text: 'ต้องการเปิดบัตรสมาชิกใหม่หรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'เปิดบัตรสมาชิก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#064e3b'
      }).then(r => {
        if (r.isConfirmed) showRegisterView();
      });
      return;
    }

    currentMember = res.member;
    localStorage.setItem('last_member_phone', currentMember.phone);
    showCardView();

    // Sync dropdown
    const sel = document.getElementById('memberSelector');
    if (sel) sel.value = currentMember.phone;

    // Apply Tier Styling
    const card = document.getElementById('virtualMemberCard');
    card.className = `card-tier-${currentMember.tier.toLowerCase()} rounded-3xl p-5 relative overflow-hidden text-white shadow-xl animate-shimmer transition-all duration-300`;

    document.getElementById('custCardTierBadge').innerText = currentMember.tier;
    document.getElementById('custCardPoints').innerText = utils.formatNumber(currentMember.points_balance);
    document.getElementById('custCardName').innerText = currentMember.name;
    document.getElementById('custCardPhone').innerText = formatPhone(currentMember.phone);
    document.getElementById('custCardCode').innerText = currentMember.member_code;
    document.getElementById('rewardPointsHeader').innerText = `แต้มของคุณ: ${utils.formatNumber(currentMember.points_balance)} แต้ม`;

    // Progress Bar
    document.getElementById('custCurrentTierLabel').innerText = `${currentMember.tier} Member`;
    document.getElementById('custTotalSpent').innerText = utils.formatCurrency(currentMember.total_spent);

    if (currentMember.next_tier) {
      document.getElementById('custNextTierText').innerText = `อีก ${utils.formatCurrency(currentMember.need_spent)} สู่ระดับ ${currentMember.next_tier}`;
      document.getElementById('custProgressBar').style.width = `${currentMember.progress_pct}%`;
    } else {
      document.getElementById('custNextTierText').innerText = 'คุณอยู่ในระดับสูงสุดแล้ว';
      document.getElementById('custProgressBar').style.width = '100%';
    }

    // QR Code
    const qrContainer = document.getElementById('custQrCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: currentMember.phone,
      width: 140,
      height: 140,
      colorDark: '#022c22',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    // Barcode
    JsBarcode('#custBarcode', currentMember.member_code, {
      format: 'CODE128',
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 12,
      font: 'Inter',
      lineColor: '#022c22'
    });

    // Render Vouchers & Activity
    renderVouchers(res.redemptions || []);
    renderActivity(res.transactions || []);
    renderRewardsCatalog();
  } catch (err) {
    console.error('Error loading member profile:', err);
  }
}

// --------------------------------------------------
// REWARDS CATALOG & SELF REDEMPTION
// --------------------------------------------------
async function loadCustomerRewards() {
  try {
    const res = await api.getRewards(true);
    if (res.success) {
      availableRewards = res.rewards;
      renderRewardsCatalog();
    }
  } catch (err) {
    console.error('Error loading rewards:', err);
  }
}

function renderRewardsCatalog() {
  const container = document.getElementById('custRewardsList');
  if (!container) return;

  if (availableRewards.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-8 border border-[#e5dfd3] text-center space-y-2">
        <i class="fa-solid fa-gift text-3xl text-slate-300"></i>
        <p class="text-xs text-slate-500 font-medium">ยังไม่มีของรางวัลเปิดให้แลกในขณะนี้</p>
      </div>
    `;
    return;
  }

  container.innerHTML = availableRewards.map(r => {
    const hasEnough = currentMember && currentMember.points_balance >= r.points_required;
    const isStockOut = r.stock <= 0;

    return `
      <div class="bg-white rounded-2xl border border-[#e5dfd3] overflow-hidden shadow-sm hover:shadow-md transition">
        <div class="flex">
          <div class="w-28 h-28 bg-[#f8f5ee] shrink-0">
            <img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.name)}" class="w-full h-full object-cover">
          </div>
          <div class="p-3 flex-1 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f8f5ee] text-[#064e3b]">${escapeHtml(r.category)}</span>
                <span class="text-[11px] font-bold text-[#996515]">${utils.formatNumber(r.points_required)} แต้ม</span>
              </div>
              <h4 class="font-bold text-slate-800 text-xs sm:text-sm mt-1 line-clamp-1">${escapeHtml(r.name)}</h4>
              <p class="text-[11px] text-slate-500 line-clamp-1 mt-0.5">${escapeHtml(r.description || '')}</p>
            </div>

            <div class="flex items-center justify-between pt-2">
              <span class="text-[10px] ${isStockOut ? 'text-rose-600 font-bold' : 'text-slate-400'}">
                ${isStockOut ? 'สต็อกหมด' : `คงเหลือ ${r.stock} ชิ้น`}
              </span>
              <button onclick="handleSelfRedeem(${r.id}, '${escapeHtml(r.name)}', ${r.points_required})"
                ${!hasEnough || isStockOut ? 'disabled' : ''}
                class="px-3 py-1 rounded-xl font-bold text-xs transition shadow-sm
                  ${!hasEnough || isStockOut 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-[#064e3b] hover:bg-[#043e2f] text-white'
                  }">
                ${!hasEnough ? 'แต้มไม่พอ' : (isStockOut ? 'หมด' : 'แลกรางวัล')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function handleSelfRedeem(rewardId, rewardName, pointsRequired) {
  if (!currentMember) return;

  const confirm = await Swal.fire({
    title: 'ยืนยันการแลกของรางวัล?',
    html: `
      <div class="text-left text-sm space-y-1">
        <p>ของรางวัล: <strong>${rewardName}</strong></p>
        <p>ใช้แต้มสะสม: <strong class="text-[#064e3b] font-bold">${pointsRequired.toLocaleString()} แต้ม</strong></p>
        <p class="text-xs text-slate-500 pt-1">เมื่อแลกแล้วจะได้รับรหัสคูปองสำหรับนำไปแสดงที่หน้าร้าน</p>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#064e3b',
    confirmButtonText: 'ยืนยันแลกเลย',
    cancelButtonText: 'ยกเลิก'
  });

  if (confirm.isConfirmed) {
    try {
      const res = await api.redeemReward(currentMember.id, rewardId);
      if (res.success) {
        utils.playSuccessSound();
        utils.fireConfetti();

        await Swal.fire({
          icon: 'success',
          title: 'แลกสำเร็จ!',
          html: `
            <div class="space-y-2 text-sm">
              <p>คุณได้รับรหัสคูปอง:</p>
              <div class="p-3 bg-[#f8f5ee] rounded-xl font-mono text-xl font-black text-[#064e3b] tracking-wider border border-[#c59b4e]/40">
                ${res.voucher_code}
              </div>
              <p class="text-xs text-slate-500">กรุณาแสดงรหัสนี้ให้พนักงานหน้าร้านเพื่อรับของรางวัล</p>
            </div>
          `,
          confirmButtonColor: '#064e3b',
          confirmButtonText: 'ดูคูปองของฉัน'
        });

        // Refresh profile and switch to vouchers tab
        await loadMemberProfile(currentMember.id);
        await loadCustomerRewards();
        switchCustTab('vouchers');
      } else {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถแลกได้', text: res.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
    }
  }
}

// --------------------------------------------------
// VOUCHERS LIST
// --------------------------------------------------
function renderVouchers(vouchers) {
  const container = document.getElementById('custVouchersList');
  if (!container) return;

  if (vouchers.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-8 border border-[#e5dfd3] text-center space-y-2">
        <i class="fa-solid fa-ticket text-3xl text-slate-300"></i>
        <p class="text-xs text-slate-500 font-medium">คุณยังไม่มีคูปองของรางวัล</p>
        <button onclick="switchCustTab('rewards')" class="px-3 py-1.5 bg-[#f8f5ee] text-[#064e3b] font-bold text-xs rounded-xl border border-[#c59b4e]/30">
          ไปดูของรางวัลน่าแลก
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = vouchers.map(v => {
    const isUsed = v.status === 'redeemed';

    return `
      <div class="bg-white rounded-2xl border ${isUsed ? 'border-slate-200 opacity-60' : 'border-[#c59b4e]/50 shadow-sm'} p-4 space-y-3">
        <div class="flex items-start justify-between">
          <div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isUsed ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-[#996515]'}">
              ${isUsed ? 'ใช้งานแล้ว' : 'พร้อมใช้งาน'}
            </span>
            <h4 class="font-bold text-slate-800 text-sm mt-1.5">${escapeHtml(v.reward_name)}</h4>
            <p class="text-[10px] text-slate-400 font-mono">แลกเมื่อ: ${utils.formatDate(v.created_at)}</p>
          </div>
          <div class="w-10 h-10 rounded-xl ${isUsed ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-[#064e3b]'} flex items-center justify-center text-lg">
            <i class="fa-solid fa-gift"></i>
          </div>
        </div>

        <div class="p-3 bg-[#fbf9f4] rounded-xl border border-dashed border-[#c59b4e] flex items-center justify-between">
          <div>
            <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">VOUCHER CODE</span>
            <div class="font-mono font-black text-base text-[#064e3b] tracking-wider">${v.voucher_code}</div>
          </div>
          <button onclick="utils.copyText('${v.voucher_code}', 'คัดลอกรหัสคูปองเรียบร้อย')" class="px-2.5 py-1 bg-white border border-[#e5dfd3] rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100">
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// --------------------------------------------------
// ACTIVITY / TRANSACTIONS LIST
// --------------------------------------------------
function renderActivity(transactions) {
  const container = document.getElementById('custActivityList');
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-8 border border-[#e5dfd3] text-center space-y-2">
        <i class="fa-solid fa-clock-rotate-left text-3xl text-slate-300"></i>
        <p class="text-xs text-slate-500 font-medium">ยังไม่มีประวัติการสะสมหรือใช้แต้ม</p>
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map(t => {
    const isPositive = t.points > 0;

    return `
      <div class="bg-white rounded-xl p-3 border border-[#e5dfd3] flex items-center justify-between shadow-xs">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg ${isPositive ? 'bg-emerald-50 text-[#064e3b]' : 'bg-rose-50 text-rose-700'} flex items-center justify-center text-xs">
            <i class="fa-solid ${isPositive ? 'fa-arrow-down-left' : 'fa-arrow-up-right'}"></i>
          </div>
          <div>
            <div class="font-bold text-xs text-slate-800">${escapeHtml(t.description || (isPositive ? 'สะสมแต้ม' : 'ใช้แต้ม'))}</div>
            <div class="text-[10px] text-slate-400 font-mono">${utils.formatDate(t.created_at)}</div>
          </div>
        </div>

        <div class="text-right">
          <div class="font-mono font-black text-xs sm:text-sm ${isPositive ? 'text-emerald-700' : 'text-rose-700'}">
            ${isPositive ? '+' : ''}${utils.formatNumber(t.points)}
          </div>
          <div class="text-[10px] text-slate-400 font-mono">คงเหลือ: ${utils.formatNumber(t.balance_after)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// --------------------------------------------------
// TAB SWITCHING
// --------------------------------------------------
function switchCustTab(tab) {
  const tabs = ['card', 'rewards', 'vouchers', 'activity'];
  tabs.forEach(t => {
    const container = document.getElementById(`customer${capitalize(t)}Container`);
    const btn = document.getElementById(`custTabBtn${capitalize(t)}`);

    if (t === tab) {
      container.classList.remove('hidden');
      btn.className = 'flex flex-col items-center text-[#064e3b] font-bold';
    } else {
      container.classList.add('hidden');
      btn.className = 'flex flex-col items-center text-slate-400 hover:text-slate-700';
    }
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPhone(phone) {
  if (!phone || phone.length !== 10) return phone;
  return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}
