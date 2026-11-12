// Admin Dashboard Logic
let currentSettings = null;
let currentMembers = [];
let currentRewards = [];

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
});

async function loadAll() {
  await loadStats();
  await loadMembers();
}

async function refreshData() {
  await loadStats();
  const activeTab = document.querySelector('.tab-button.border-\\[\\#064e3b\\]')?.id || 'tabBtnMembers';
  if (activeTab === 'tabBtnRewards') {
    await loadRewards();
  } else if (activeTab === 'tabBtnRedemptions') {
    await loadRedemptions();
  } else if (activeTab === 'tabBtnTransactions') {
    await loadTransactions();
  } else {
    await loadMembers();
  }
}

// ---------------------------------------------
// LOAD STATS & SETTINGS
// ---------------------------------------------
async function loadStats() {
  try {
    const res = await api.getStats();
    if (!res.success) return;

    const { stats } = res;
    currentSettings = stats.settings;

    // Header info
    document.getElementById('topStoreName').innerHTML = `
      ${escapeHtml(stats.settings.store_name)}
      <span class="text-[10px] font-normal bg-red-800 text-rose-100 border border-red-700 px-1.5 py-0.2 rounded font-mono">云南</span>
    `;
    document.getElementById('topStoreTagline').innerText = stats.settings.store_tagline || 'ระบบบริหารจัดการแต้มสะสม & บัตรสมาชิก LINE OA';
    document.getElementById('topPointRateBadge').innerText = `${stats.settings.point_rate} บาท = 1 แต้ม`;
    
    // LIFF Link
    const liffUrl = stats.settings.liff_url || 'https://liff.line.me/yunnan-import';
    document.getElementById('liffLinkText').innerText = liffUrl;

    // Metrics
    document.getElementById('statMembersCount').innerText = utils.formatNumber(stats.total_members);
    document.getElementById('statPointsBalance').innerText = utils.formatNumber(stats.total_points);
    document.getElementById('statTotalSales').innerText = utils.formatCurrency(stats.total_sales);
    document.getElementById('statRedeemedCount').innerText = utils.formatNumber(stats.total_redemptions);
    document.getElementById('statPointsRedeemed').innerText = `${utils.formatNumber(stats.points_redeemed)} แต้มถูกใช้แลก`;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

function copyLiffLink() {
  const text = document.getElementById('liffLinkText').innerText;
  utils.copyText(text, 'คัดลอกลิงก์สำหรับ LINE OA เรียบร้อยแล้ว!');
}

// ---------------------------------------------
// TABS SWITCHER
// ---------------------------------------------
function switchTab(tab) {
  const tabs = ['members', 'rewards', 'redemptions', 'transactions'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${capitalize(t)}`);
    const content = document.getElementById(`tabContent${capitalize(t)}`);
    if (t === tab) {
      btn.className = 'tab-button px-4 py-2.5 font-semibold text-sm rounded-t-xl border-b-2 border-[#064e3b] text-[#064e3b] flex items-center space-x-2';
      content.classList.remove('hidden');
    } else {
      btn.className = 'tab-button px-4 py-2.5 font-semibold text-sm rounded-t-xl border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center space-x-2';
      content.classList.add('hidden');
    }
  });

  if (tab === 'members') loadMembers();
  if (tab === 'rewards') loadRewards();
  if (tab === 'redemptions') loadRedemptions();
  if (tab === 'transactions') loadTransactions();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------
// MEMBERS MANAGEMENT
// ---------------------------------------------
async function loadMembers() {
  try {
    const search = document.getElementById('memberSearchInput').value;
    const tier = document.getElementById('memberTierFilter').value;
    
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-xl mr-2 text-[#064e3b]"></i>กำลังค้นหา...</td></tr>`;

    const res = await api.getMembers({ search, tier });
    if (!res.success) return;

    currentMembers = res.members;

    if (currentMembers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-12 text-slate-400 bg-white">
            <i class="fa-regular fa-folder-open text-4xl mb-2 text-slate-300"></i>
            <p class="font-medium text-slate-600">ยังไม่มีข้อมูลสมาชิกร้านค้า (ระบบว่างพร้อมใช้งาน)</p>
            <p class="text-xs text-slate-400 mt-1">สามารถกดปุ่ม "เพิ่มสมาชิกใหม่" ด้านบนเพื่อเริ่มลงทะเบียนสมาชิกคนแรก</p>
            <button onclick="openAddMemberModal()" class="mt-3 px-4 py-2 bg-[#064e3b] hover:bg-[#043e2f] text-white font-semibold text-xs rounded-xl shadow transition">
              <i class="fa-solid fa-user-plus mr-1"></i> เพิ่มสมาชิกคนแรก
            </button>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = currentMembers.map(m => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-4 font-mono font-bold text-slate-700">${m.member_code}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-800">${escapeHtml(m.name)}</div>
          ${m.notes ? `<div class="text-[11px] text-slate-400">${escapeHtml(m.notes)}</div>` : ''}
        </td>
        <td class="py-3 px-4 font-mono text-slate-600">${formatPhone(m.phone)}</td>
        <td class="py-3 px-4">${utils.getTierBadgeHtml(m.tier)}</td>
        <td class="py-3 px-4 text-right font-mono font-semibold text-slate-700">${utils.formatCurrency(m.total_spent)}</td>
        <td class="py-3 px-4 text-right font-mono font-extrabold text-[#064e3b] text-base">${utils.formatNumber(m.points_balance)}</td>
        <td class="py-3 px-4 text-xs text-slate-500 font-mono">${utils.formatDate(m.created_at)}</td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center space-x-1.5">
            <button onclick="viewMemberCard(${m.id})" title="ดูบัตรสมาชิกดิจิทัล" class="p-1.5 rounded-lg bg-emerald-50 text-[#064e3b] hover:bg-emerald-100 transition">
              <i class="fa-solid fa-id-card"></i>
            </button>
            <button onclick="openAdjustModal(${m.id})" title="ปรับเพิ่ม/ลดแต้ม" class="p-1.5 rounded-lg bg-amber-50 text-[#996515] hover:bg-amber-100 transition">
              <i class="fa-solid fa-plus-minus"></i>
            </button>
            <button onclick="openEditMemberModal(${m.id})" title="แก้ไขข้อมูล" class="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="handleDeleteMember(${m.id}, '${escapeHtml(m.name)}')" title="ลบสมาชิก" class="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading members:', err);
  }
}

function formatPhone(phone) {
  if (!phone || phone.length !== 10) return phone;
  return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
}

// ---------------------------------------------
// ADD / EDIT MEMBER
// ---------------------------------------------
function openAddMemberModal() {
  document.getElementById('memberModalTitle').innerText = 'เพิ่มสมาชิกใหม่';
  document.getElementById('editMemberId').value = '';
  document.getElementById('memberFormName').value = '';
  document.getElementById('memberFormPhone').value = '';
  document.getElementById('memberFormPoints').value = '0';
  document.getElementById('memberFormNotes').value = '';
  document.getElementById('initialPointsGroup').classList.remove('hidden');
  openModal('memberModal');
}

function openEditMemberModal(id) {
  const member = currentMembers.find(m => m.id === id);
  if (!member) return;

  document.getElementById('memberModalTitle').innerText = 'แก้ไขข้อมูลสมาชิก';
  document.getElementById('editMemberId').value = member.id;
  document.getElementById('memberFormName').value = member.name;
  document.getElementById('memberFormPhone').value = member.phone;
  document.getElementById('memberFormNotes').value = member.notes || '';
  document.getElementById('initialPointsGroup').classList.add('hidden');
  openModal('memberModal');
}

async function handleSaveMember(e) {
  e.preventDefault();
  const id = document.getElementById('editMemberId').value;
  const name = document.getElementById('memberFormName').value;
  const phone = document.getElementById('memberFormPhone').value;
  const notes = document.getElementById('memberFormNotes').value;

  try {
    let res;
    if (id) {
      res = await api.updateMember(id, { name, phone, notes });
    } else {
      const initial_points = document.getElementById('memberFormPoints').value;
      res = await api.addMember({ name, phone, initial_points, notes });
    }

    if (res.success) {
      closeModal('memberModal');
      Swal.fire({ icon: 'success', title: 'สำเร็จ', text: res.message, timer: 1800, showConfirmButton: false });
      loadAll();
    } else {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

async function handleDeleteMember(id, name) {
  const confirm = await Swal.fire({
    title: 'ยืนยันการลบสมาชิก?',
    text: `ต้องการลบคุณ ${name} หรือไม่? (ประวัติการสะสมแต้มและคูปองจะถูกลบด้วย)`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#064e3b',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ใช่, ลบเลย',
    cancelButtonText: 'ยกเลิก'
  });

  if (confirm.isConfirmed) {
    const res = await api.deleteMember(id);
    if (res.success) {
      Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', text: res.message, timer: 1500, showConfirmButton: false });
      loadAll();
    } else {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: res.message });
    }
  }
}

// ---------------------------------------------
// ADJUST POINTS MODAL
// ---------------------------------------------
function openAdjustModal(id) {
  const member = currentMembers.find(m => m.id === id);
  if (!member) return;

  document.getElementById('adjustMemberId').value = member.id;
  document.getElementById('adjustMemberName').innerText = `${member.name} (${member.member_code})`;
  document.getElementById('adjustCurrentPoints').innerText = utils.formatNumber(member.points_balance);
  document.getElementById('adjustPoints').value = '';
  document.getElementById('adjustReason').value = '';
  openModal('adjustModal');
}

async function handleSaveAdjust(e) {
  e.preventDefault();
  const id = document.getElementById('adjustMemberId').value;
  const points = document.getElementById('adjustPoints').value;
  const reason = document.getElementById('adjustReason').value;
  const type = document.querySelector('input[name="adjustType"]:checked').value;

  try {
    const res = await api.adjustPoints(id, points, type, reason);
    if (res.success) {
      closeModal('adjustModal');
      Swal.fire({ icon: 'success', title: 'สำเร็จ', text: res.message, timer: 1800, showConfirmButton: false });
      loadAll();
    } else {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  }
}

// ---------------------------------------------
// VIRTUAL CARD & PROFILE MODAL
// ---------------------------------------------
async function viewMemberCard(id) {
  try {
    const res = await api.getMember(id);
    if (!res.success) return;

    const m = res.member;

    // Apply Tier styling to Virtual Card
    const card = document.getElementById('profileVirtualCard');
    card.className = `card-tier-${m.tier.toLowerCase()} rounded-3xl p-6 relative overflow-hidden text-white shadow-xl`;
    
    document.getElementById('profileCardTierBadge').innerText = m.tier;
    document.getElementById('profileCardPoints').innerText = utils.formatNumber(m.points_balance);
    document.getElementById('profileCardName').innerText = m.name;
    document.getElementById('profileCardPhone').innerText = formatPhone(m.phone);
    document.getElementById('profileCardCode').innerText = m.member_code;

    // Render QR Code
    const qrContainer = document.getElementById('profileQrCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: m.phone,
      width: 140,
      height: 140,
      colorDark: '#022c22',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    // Render Barcode
    JsBarcode('#profileBarcode', m.member_code, {
      format: 'CODE128',
      width: 1.6,
      height: 45,
      displayValue: false,
      lineColor: '#022c22'
    });

    // Progress to next tier
    document.getElementById('profileTotalSpent').innerText = utils.formatCurrency(m.total_spent);
    if (m.next_tier) {
      document.getElementById('profileNextTierGoal').innerText = `สะสมอีก ${utils.formatCurrency(m.need_spent)} สู่ระดับ ${m.next_tier}`;
      document.getElementById('profileProgressBar').style.width = `${m.progress_pct}%`;
      document.getElementById('profileTierProgressBox').classList.remove('hidden');
    } else {
      document.getElementById('profileNextTierGoal').innerText = 'คุณอยู่ในระดับสูงสุดแล้ว (Highest Tier)';
      document.getElementById('profileProgressBar').style.width = '100%';
    }

    document.getElementById('profileAdjustBtn').onclick = () => {
      closeModal('memberProfileModal');
      openAdjustModal(m.id);
    };

    openModal('memberProfileModal');
  } catch (err) {
    console.error('Error viewing member:', err);
  }
}

// ---------------------------------------------
// REWARDS CATALOG MANAGEMENT
// ---------------------------------------------
async function loadRewards() {
  try {
    const res = await api.getRewards();
    if (!res.success) return;
    currentRewards = res.rewards;

    const grid = document.getElementById('rewardsGrid');
    if (currentRewards.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-400 bg-[#fbf9f4] rounded-2xl border border-[#e5dfd3] p-8">
          <i class="fa-solid fa-gift text-4xl mb-2 text-[#c59b4e]"></i>
          <p class="font-bold text-slate-700">ยังไม่มีของรางวัลในแคตตาล็อก</p>
          <p class="text-xs text-slate-500 mt-1">กดปุ่ม "+ เพิ่มของรางวัลใหม่" ด้านบนเพื่อเริ่มสร้างของรางวัลสำหรับแลกแต้ม</p>
          <button onclick="openAddRewardModal()" class="mt-3 px-4 py-2 bg-[#064e3b] hover:bg-[#043e2f] text-white font-semibold text-xs rounded-xl shadow transition">
            <i class="fa-solid fa-plus mr-1"></i> เพิ่มของรางวัลแรก
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = currentRewards.map(r => `
      <div class="bg-white rounded-2xl border border-[#e5dfd3] overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between">
        <div>
          <div class="relative h-44 bg-[#f8f5ee] overflow-hidden">
            <img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.name)}" class="w-full h-full object-cover">
            <span class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-xs font-bold ${r.stock > 0 ? 'bg-[#064e3b] text-white' : 'bg-red-700 text-white'} shadow">
              ${r.stock > 0 ? `สต็อก: ${r.stock}` : 'หมดชั่วคราว'}
            </span>
            <span class="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-black/60 text-white backdrop-blur-md">
              ${escapeHtml(r.category)}
            </span>
          </div>

          <div class="p-4 space-y-2">
            <h4 class="font-bold text-slate-800 text-base leading-snug">${escapeHtml(r.name)}</h4>
            <p class="text-xs text-slate-500 line-clamp-2">${escapeHtml(r.description || 'ไม่มีคำอธิบาย')}</p>
            
            <div class="flex items-center justify-between pt-2">
              <span class="text-xs font-medium text-slate-500">
                สิทธิ์: <strong class="text-slate-800">${r.min_tier}+</strong>
              </span>
              <div class="flex items-baseline space-x-1">
                <span class="text-xl font-extrabold text-[#064e3b]">${utils.formatNumber(r.points_required)}</span>
                <span class="text-xs font-semibold text-slate-500">แต้ม</span>
              </div>
            </div>
          </div>
        </div>

        <div class="p-3 bg-[#f8f5ee] border-t border-[#e5dfd3] flex items-center justify-between">
          <span class="text-[11px] font-medium ${r.is_active ? 'text-[#064e3b]' : 'text-slate-400'}">
            <i class="fa-solid fa-circle text-[8px] mr-1"></i>${r.is_active ? 'เปิดให้แลก' : 'ปิดแลก'}
          </span>
          <div class="flex space-x-1">
            <button onclick="openEditRewardModal(${r.id})" class="p-1.5 rounded-lg bg-white border border-[#e5dfd3] text-slate-600 hover:text-slate-900 transition text-xs">
              <i class="fa-solid fa-pen"></i> แก้ไข
            </button>
            <button onclick="handleDeleteReward(${r.id}, '${escapeHtml(r.name)}')" class="p-1.5 rounded-lg bg-white border border-[#e5dfd3] text-rose-600 hover:bg-rose-50 transition text-xs">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading rewards:', err);
  }
}

function openAddRewardModal() {
  document.getElementById('rewardModalTitle').innerText = 'เพิ่มของรางวัลใหม่';
  document.getElementById('editRewardId').value = '';
  document.getElementById('rewardFormName').value = '';
  document.getElementById('rewardFormCategory').value = 'ชา & สินค้ายูนนาน';
  document.getElementById('rewardFormPoints').value = '100';
  document.getElementById('rewardFormStock').value = '10';
  document.getElementById('rewardFormMinTier').value = 'Silver';
  document.getElementById('rewardFormImage').value = '';
  document.getElementById('rewardFormDesc').value = '';
  openModal('rewardModal');
}

function openEditRewardModal(id) {
  const r = currentRewards.find(item => item.id === id);
  if (!r) return;

  document.getElementById('rewardModalTitle').innerText = 'แก้ไขของรางวัล';
  document.getElementById('editRewardId').value = r.id;
  document.getElementById('rewardFormName').value = r.name;
  document.getElementById('rewardFormCategory').value = r.category;
  document.getElementById('rewardFormPoints').value = r.points_required;
  document.getElementById('rewardFormStock').value = r.stock;
  document.getElementById('rewardFormMinTier').value = r.min_tier;
  document.getElementById('rewardFormImage').value = r.image_url;
  document.getElementById('rewardFormDesc').value = r.description || '';
  openModal('rewardModal');
}

async function handleSaveReward(e) {
  e.preventDefault();
  const id = document.getElementById('editRewardId').value;
  const data = {
    name: document.getElementById('rewardFormName').value,
    category: document.getElementById('rewardFormCategory').value,
    points_required: document.getElementById('rewardFormPoints').value,
    stock: document.getElementById('rewardFormStock').value,
    min_tier: document.getElementById('rewardFormMinTier').value,
    image_url: document.getElementById('rewardFormImage').value,
    description: document.getElementById('rewardFormDesc').value
  };

  try {
    let res;
    if (id) {
      res = await api.updateReward(id, data);
    } else {
      res = await api.addReward(data);
    }

    if (res.success) {
      closeModal('rewardModal');
      Swal.fire({ icon: 'success', title: 'สำเร็จ', text: res.message, timer: 1500, showConfirmButton: false });
      loadRewards();
    } else {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  }
}

async function handleDeleteReward(id, name) {
  const confirm = await Swal.fire({
    title: 'ยืนยันการลบของรางวัล?',
    text: `ต้องการลบ "${name}" ออกจากแคตตาล็อกหรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#064e3b',
    confirmButtonText: 'ลบเลย',
    cancelButtonText: 'ยกเลิก'
  });

  if (confirm.isConfirmed) {
    const res = await api.deleteReward(id);
    if (res.success) {
      loadRewards();
    }
  }
}

// ---------------------------------------------
// REDEMPTIONS & VOUCHERS
// ---------------------------------------------
async function loadRedemptions(status = '') {
  try {
    const res = await api.getRedemptions(status);
    if (!res.success) return;

    const tbody = document.getElementById('redemptionsTableBody');
    if (res.redemptions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-10 text-slate-400 bg-white">
            <i class="fa-solid fa-ticket text-3xl mb-1 text-slate-300"></i>
            <p>ยังไม่มีประวัติการแลกของรางวัลในระบบ</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = res.redemptions.map(r => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-4 font-mono font-bold text-[#064e3b]">${r.voucher_code}</td>
        <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(r.reward_name)}</td>
        <td class="py-3 px-4">
          <div class="font-medium text-slate-800">${escapeHtml(r.member_name)}</div>
          <div class="text-[11px] text-slate-400 font-mono">${formatPhone(r.member_phone)}</div>
        </td>
        <td class="py-3 px-4 text-right font-mono font-bold text-slate-700">${utils.formatNumber(r.points_spent)}</td>
        <td class="py-3 px-4 text-xs text-slate-500 font-mono">${utils.formatDate(r.created_at)}</td>
        <td class="py-3 px-4">
          ${r.status === 'redeemed' 
            ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i>ใช้งานแล้ว</span>'
            : '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-[#996515]"><i class="fa-solid fa-clock mr-1"></i>ยังไม่ใช้งาน</span>'
          }
        </td>
        <td class="py-3 px-4 text-center">
          ${r.status === 'pending'
            ? `<button onclick="confirmRedeemVoucher('${r.voucher_code}')" class="px-3 py-1 bg-[#064e3b] hover:bg-[#043e2f] text-white font-bold text-xs rounded-lg shadow-sm transition">
                ยืนยันการใช้
               </button>`
            : `<span class="text-xs text-slate-400">${utils.formatDate(r.redeemed_at)}</span>`
          }
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading redemptions:', err);
  }
}

async function verifyVoucher() {
  const code = document.getElementById('voucherCodeInput').value;
  if (!code) {
    Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณากรอกรหัสคูปอง' });
    return;
  }

  await confirmRedeemVoucher(code);
}

async function confirmRedeemVoucher(code) {
  try {
    const res = await api.verifyVoucher(code);
    if (res.success) {
      utils.playSuccessSound();
      utils.fireConfetti();
      Swal.fire({
        icon: 'success',
        title: 'ยืนยันการใช้สิทธิ์สำเร็จ!',
        html: `ของรางวัล: <strong>${res.redemption.reward_name}</strong><br>สิทธิ์ของ: <strong>${res.redemption.member_name}</strong>`,
        timer: 3000
      });
      document.getElementById('voucherCodeInput').value = '';
      loadRedemptions();
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถใช้งานคูปองได้', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  }
}

// ---------------------------------------------
// TRANSACTIONS LOG
// ---------------------------------------------
async function loadTransactions() {
  try {
    const type = document.getElementById('txnTypeFilter').value;
    const res = await api.getTransactions({ type });
    if (!res.success) return;

    const tbody = document.getElementById('transactionsTableBody');
    if (res.transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-10 text-slate-400 bg-white">
            <i class="fa-solid fa-clock-rotate-left text-3xl mb-1 text-slate-300"></i>
            <p>ยังไม่มีประวัติความเคลื่อนไหวแต้มในระบบ</p>
          </td>
        </tr>
      `;
      return;
    }

    const typeBadges = {
      EARN: '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">+ สะสมแต้ม</span>',
      REDEEM: '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">- แลกรางวัล</span>',
      ADJUST_ADD: '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">+ ปรับเพิ่ม</span>',
      ADJUST_SUB: '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-700">- ปรับลด</span>'
    };

    tbody.innerHTML = res.transactions.map(t => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-4 font-mono text-xs text-slate-500">${t.transaction_code}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-800">${escapeHtml(t.member_name)}</div>
          <div class="text-[11px] text-slate-400 font-mono">${formatPhone(t.member_phone)}</div>
        </td>
        <td class="py-3 px-4">${typeBadges[t.type] || t.type}</td>
        <td class="py-3 px-4 text-right font-mono font-medium">${t.purchase_amount > 0 ? utils.formatCurrency(t.purchase_amount) : '-'}</td>
        <td class="py-3 px-4 text-right font-mono font-extrabold ${t.points > 0 ? 'text-emerald-700' : 'text-rose-700'}">
          ${t.points > 0 ? '+' : ''}${utils.formatNumber(t.points)}
        </td>
        <td class="py-3 px-4 text-right font-mono font-semibold text-slate-700">${utils.formatNumber(t.balance_after)}</td>
        <td class="py-3 px-4 text-xs text-slate-600">${escapeHtml(t.description || '-')}</td>
        <td class="py-3 px-4 text-xs text-slate-500 font-mono">${utils.formatDate(t.created_at)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading transactions:', err);
  }
}

// ---------------------------------------------
// SETTINGS
// ---------------------------------------------
async function openSettingsModal() {
  if (!currentSettings) {
    const res = await api.getSettings();
    if (res.success) currentSettings = res.settings;
  }

  const s = currentSettings;
  document.getElementById('setStoreName').value = s.store_name;
  document.getElementById('setStoreTagline').value = s.store_tagline || '';
  document.getElementById('setPointRate').value = s.point_rate;
  document.getElementById('setLiffUrl').value = s.liff_url || '';
  document.getElementById('setSilverMultiplier').value = s.silver_multiplier || 1.0;
  document.getElementById('setGoldMin').value = s.gold_min;
  document.getElementById('setGoldMultiplier').value = s.gold_multiplier || 1.2;
  document.getElementById('setPlatinumMin').value = s.platinum_min;
  document.getElementById('setPlatinumMultiplier').value = s.platinum_multiplier || 1.5;
  document.getElementById('setDiamondMin').value = s.diamond_min;
  document.getElementById('setDiamondMultiplier').value = s.diamond_multiplier || 2.0;

  // LINE & SlipOK settings
  document.getElementById('setLineToken').value = s.line_channel_access_token || '';
  document.getElementById('setSlipokKey').value = s.slipok_api_key || '';
  document.getElementById('setSlipokBranch').value = s.slipok_branch_id || '';
  document.getElementById('lineWebhookUrlText').innerText = `${window.location.origin}/api/webhook/line`;

  openModal('settingsModal');
}

function copyWebhookUrl() {
  const url = document.getElementById('lineWebhookUrlText').innerText;
  utils.copyText(url, 'คัดลอก LINE Webhook URL เรียบร้อยแล้ว!');
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const data = {
    store_name: document.getElementById('setStoreName').value,
    store_tagline: document.getElementById('setStoreTagline').value,
    point_rate: document.getElementById('setPointRate').value,
    liff_url: document.getElementById('setLiffUrl').value,
    silver_multiplier: document.getElementById('setSilverMultiplier').value,
    gold_min: document.getElementById('setGoldMin').value,
    gold_multiplier: document.getElementById('setGoldMultiplier').value,
    platinum_min: document.getElementById('setPlatinumMin').value,
    platinum_multiplier: document.getElementById('setPlatinumMultiplier').value,
    diamond_min: document.getElementById('setDiamondMin').value,
    diamond_multiplier: document.getElementById('setDiamondMultiplier').value,
    line_channel_access_token: document.getElementById('setLineToken').value.trim(),
    slipok_api_key: document.getElementById('setSlipokKey').value.trim(),
    slipok_branch_id: document.getElementById('setSlipokBranch').value.trim()
  };

  try {
    const res = await api.saveSettings(data);
    if (res.success) {
      closeModal('settingsModal');
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: res.message, timer: 1500, showConfirmButton: false });
      loadAll();
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  }
}

async function handleResetDemo() {
  const confirm = await Swal.fire({
    title: 'ต้องการล้างข้อมูลระบบ?',
    text: 'การทำรายการนี้จะล้างข้อมูลทั้งหมดให้เป็นหน้าเปล่า',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#064e3b',
    confirmButtonText: 'ยืนยันล้างข้อมูล'
  });

  if (confirm.isConfirmed) {
    await fetch('/api/system/reset-demo', { method: 'POST' });
    location.reload();
  }
}

// ---------------------------------------------
// MODAL HELPERS
// ---------------------------------------------
function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('hidden');
}

function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}
