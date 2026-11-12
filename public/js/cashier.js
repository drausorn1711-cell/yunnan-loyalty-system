// Cashier POS Logic
let currentSettings = null;
let selectedMember = null;
let allRewards = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettingsAndRewards();
});

async function loadSettingsAndRewards() {
  try {
    const setRes = await api.getSettings();
    if (setRes.success) {
      currentSettings = setRes.settings;
      document.getElementById('cashierStoreTitle').innerText = `${currentSettings.store_name} - หน้าร้าน`;
      document.getElementById('cashierRateTag').innerText = `${currentSettings.point_rate} บาท = 1 แต้ม`;
    }

    const rwdRes = await api.getRewards(true);
    if (rwdRes.success) {
      allRewards = rwdRes.rewards;
      renderCashierRewards();
    }
  } catch (err) {
    console.error('Error loading settings/rewards:', err);
  }
}

// --------------------------------------------------
// MEMBER LOOKUP & SELECTION
// --------------------------------------------------
function handleSearchInput(e) {
  if (e.key === 'Enter') {
    searchMember();
  }
}

function quickSelectMember(phone) {
  document.getElementById('posMemberInput').value = phone;
  searchMember();
}

async function searchMember() {
  const query = document.getElementById('posMemberInput').value.trim();
  if (!query) {
    Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'พิมพ์เบอร์โทร หรือ รหัสสมาชิก' });
    return;
  }

  try {
    const res = await api.getMember(query);
    if (res.success && res.member) {
      selectMember(res.member);
    } else {
      Swal.fire({
        icon: 'info',
        title: 'ไม่พบสมาชิก',
        text: `ไม่พบข้อมูลสำหรับ "${query}" ต้องการสมัครสมาชิกใหม่หรือไม่?`,
        showCancelButton: true,
        confirmButtonText: 'สมัครสมาชิกใหม่',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#10b981'
      }).then(result => {
        if (result.isConfirmed) {
          openQuickRegisterModal(query);
        }
      });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

function selectMember(member) {
  selectedMember = member;

  // Render UI
  document.getElementById('selectedMemberCard').classList.remove('hidden');
  document.getElementById('noMemberPlaceholder').classList.add('hidden');

  document.getElementById('posMemberName').innerText = member.name;
  document.getElementById('posMemberCode').innerText = member.member_code;
  document.getElementById('posMemberPhone').innerText = formatPhone(member.phone);
  document.getElementById('posMemberPoints').innerText = utils.formatNumber(member.points_balance);
  document.getElementById('posMemberTierBadge').innerHTML = utils.getTierBadgeHtml(member.tier);

  // Multiplier Info
  const mult = getMemberMultiplier(member.tier);
  if (mult > 1.0) {
    document.getElementById('posMultiplierInfo').innerHTML = `<i class="fa-solid fa-bolt mr-1 text-amber-500"></i>โบนัส Tier ${member.tier} x${mult}`;
    document.getElementById('posMultiplierInfo').classList.remove('hidden');
  } else {
    document.getElementById('posMultiplierInfo').classList.add('hidden');
  }

  calculatePointsPreview();
  renderCashierRewards();

  // Focus amount input
  document.getElementById('posAmountInput').focus();
}

function getMemberMultiplier(tier) {
  if (!currentSettings) return 1.0;
  switch (tier) {
    case 'Diamond': return currentSettings.diamond_multiplier || 2.0;
    case 'Platinum': return currentSettings.platinum_multiplier || 1.5;
    case 'Gold': return currentSettings.gold_multiplier || 1.2;
    default: return currentSettings.silver_multiplier || 1.0;
  }
}

// --------------------------------------------------
// PURCHASE AMOUNT & POINTS PREVIEW
// --------------------------------------------------
function setQuickAmount(amt) {
  const input = document.getElementById('posAmountInput');
  const current = parseFloat(input.value) || 0;
  input.value = current + amt;
  calculatePointsPreview();
}

function clearAmount() {
  document.getElementById('posAmountInput').value = '';
  calculatePointsPreview();
}

function calculatePointsPreview() {
  const amount = parseFloat(document.getElementById('posAmountInput').value) || 0;
  const rate = currentSettings?.point_rate || 1.0;
  const multiplier = selectedMember ? getMemberMultiplier(selectedMember.tier) : 1.0;

  const points = Math.floor((amount / rate) * multiplier);

  document.getElementById('posPreviewPoints').innerText = `+${utils.formatNumber(points)}`;
  document.getElementById('posFormulaHint').innerText = `อัตรา ฿${rate} = 1 แต้ม ${multiplier > 1.0 ? `(โบนัส x${multiplier})` : ''}`;
}

// --------------------------------------------------
// SUBMIT POS EARN POINTS
// --------------------------------------------------
async function handlePosEarnPoints() {
  if (!selectedMember) {
    Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณาค้นหาและเลือกสมาชิกก่อน' });
    return;
  }

  const amount = parseFloat(document.getElementById('posAmountInput').value);
  if (!amount || amount <= 0) {
    Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณาระบุยอดซื้อสินค้าที่ถูกต้อง' });
    return;
  }

  const receipt_no = document.getElementById('posReceiptNo').value.trim();
  const note = document.getElementById('posNote').value.trim();

  const btn = document.getElementById('posEarnBtn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xl mr-2"></i>กำลังบันทึก...`;

  try {
    const res = await api.posEarnPoints({
      identifier: selectedMember.phone,
      amount,
      receipt_no,
      note
    });

    if (res.success) {
      utils.playSuccessSound();
      utils.fireConfetti();

      // Check tier upgrade alert
      let upgradeHtml = '';
      if (res.is_upgraded) {
        upgradeHtml = `
          <div class="mt-3 p-3 bg-gradient-to-r from-amber-100 to-amber-200 border border-amber-300 rounded-xl text-amber-900 font-bold text-center animate-bounce">
            🎉 ยินดีด้วย! สมาชิกได้รับการเลื่อนระดับเป็น <u>${res.new_tier}</u>
          </div>
        `;
      }

      await Swal.fire({
        icon: 'success',
        title: 'สะสมแต้มสำเร็จ!',
        html: `
          <div class="text-left space-y-1.5 text-sm">
            <p>สมาชิก: <strong>${escapeHtml(res.member.name)}</strong></p>
            <p>ยอดซื้อ: <strong>฿${amount.toLocaleString()}</strong></p>
            <p class="text-emerald-700 font-bold text-base">แต้มที่ได้รับ: +${res.points_earned.toLocaleString()} แต้ม</p>
            <p>แต้มสะสมคงเหลือใหม่: <strong>${res.member.points_balance.toLocaleString()} แต้ม</strong></p>
            ${upgradeHtml}
          </div>
        `,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'ตกลง'
      });

      // Update selected member in state
      selectMember(res.member);
      document.getElementById('posAmountInput').value = '';
      document.getElementById('posReceiptNo').value = '';
      document.getElementById('posNote').value = '';
      calculatePointsPreview();
    } else {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-circle-check text-xl"></i><span>ยืนยันบันทึกยอดซื้อ & สะสมแต้ม</span>`;
  }
}

// --------------------------------------------------
// IN-STORE REWARDS RENDER & REDEEM
// --------------------------------------------------
function renderCashierRewards() {
  const container = document.getElementById('cashierRewardsList');

  if (allRewards.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">ไม่มีของรางวัลที่เปิดให้แลก</p>`;
    return;
  }

  container.innerHTML = allRewards.map(r => {
    const hasEnough = selectedMember && selectedMember.points_balance >= r.points_required;
    const isStockOut = r.stock <= 0;

    return `
      <div class="p-3 rounded-2xl border ${hasEnough ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white'} flex items-center justify-between gap-3 hover:shadow-sm transition">
        <div class="flex items-center space-x-3 min-w-0">
          <img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.name)}" class="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200">
          <div class="min-w-0">
            <h4 class="font-bold text-slate-800 text-xs sm:text-sm truncate">${escapeHtml(r.name)}</h4>
            <div class="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
              <span class="font-bold text-rose-700">${utils.formatNumber(r.points_required)} แต้ม</span>
              <span>•</span>
              <span class="${isStockOut ? 'text-rose-600 font-bold' : 'text-slate-500'}">เหลือ ${r.stock} ชิ้น</span>
            </div>
          </div>
        </div>

        <div>
          <button onclick="handleInStoreRedeem(${r.id}, '${escapeHtml(r.name)}', ${r.points_required})"
            ${!selectedMember || !hasEnough || isStockOut ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap shadow-sm
              ${!selectedMember || !hasEnough || isStockOut 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-rose-700 hover:bg-rose-800 text-white'
              }">
            ${isStockOut ? 'ของหมด' : 'แลกให้ลูกค้า'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function handleInStoreRedeem(rewardId, rewardName, pointsRequired) {
  if (!selectedMember) return;

  const confirm = await Swal.fire({
    title: 'ยืนยันการแลกของรางวัลหน้าร้าน?',
    html: `
      <div class="text-left text-sm space-y-1">
        <p>สมาชิก: <strong>${escapeHtml(selectedMember.name)}</strong></p>
        <p>ของรางวัล: <strong>${rewardName}</strong></p>
        <p>แต้มที่จะถูกหัก: <strong class="text-rose-600 font-bold">${pointsRequired.toLocaleString()} แต้ม</strong></p>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    confirmButtonText: 'ยืนยันตัดแต้ม & มอบรางวัล',
    cancelButtonText: 'ยกเลิก'
  });

  if (confirm.isConfirmed) {
    try {
      const res = await api.redeemReward(selectedMember.id, rewardId);
      if (res.success) {
        // Automatically verify voucher since it's delivered in store
        await api.verifyVoucher(res.voucher_code);

        utils.playSuccessSound();
        utils.fireConfetti();

        await Swal.fire({
          icon: 'success',
          title: 'แลกและมอบของรางวัลสำเร็จ!',
          html: `รหัสคูปอง: <strong>${res.voucher_code}</strong><br>แต้มคงเหลือใหม่: <strong>${res.new_balance.toLocaleString()} แต้ม</strong>`,
          confirmButtonColor: '#10b981'
        });

        // Refresh member data
        const updatedRes = await api.getMember(selectedMember.id);
        if (updatedRes.success) {
          selectMember(updatedRes.member);
        }
        await loadSettingsAndRewards();
      } else {
        Swal.fire({ icon: 'error', title: 'แลกไม่สำเร็จ', text: res.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
    }
  }
}

// --------------------------------------------------
// CASHIER VOUCHER VERIFY
// --------------------------------------------------
async function handlePosVerifyVoucher() {
  const code = document.getElementById('posVoucherInput').value.trim();
  if (!code) {
    Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณากรอกรหัสคูปอง' });
    return;
  }

  try {
    const res = await api.verifyVoucher(code);
    if (res.success) {
      utils.playSuccessSound();
      utils.fireConfetti();

      Swal.fire({
        icon: 'success',
        title: 'ยืนยันการใช้คูปองเรียบร้อย!',
        html: `
          <div class="text-left text-sm space-y-1">
            <p>ของรางวัล: <strong class="text-rose-700">${res.redemption.reward_name}</strong></p>
            <p>สมาชิก: <strong>${res.redemption.member_name}</strong></p>
            <p class="text-xs text-slate-500">รหัสคูปอง: ${res.redemption.voucher_code}</p>
          </div>
        `,
        confirmButtonColor: '#10b981'
      });
      document.getElementById('posVoucherInput').value = '';
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถใช้งานคูปองได้', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  }
}

// --------------------------------------------------
// QUICK REGISTER MODAL
// --------------------------------------------------
function openQuickRegisterModal(prefillPhone = '') {
  document.getElementById('regName').value = '';
  document.getElementById('regPhone').value = prefillPhone;
  document.getElementById('regPoints').value = '0';
  document.getElementById('quickRegisterModal').classList.remove('hidden');
}

async function handleQuickRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const initial_points = document.getElementById('regPoints').value;

  try {
    const res = await api.addMember({ name, phone, initial_points });
    if (res.success) {
      closeModal('quickRegisterModal');
      utils.playSuccessSound();
      Swal.fire({ icon: 'success', title: 'สมัครสมาชิกสำเร็จ!', text: `ยินดีต้อนรับ ${res.member.name}`, timer: 1500, showConfirmButton: false });
      selectMember(res.member);
    } else {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
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
