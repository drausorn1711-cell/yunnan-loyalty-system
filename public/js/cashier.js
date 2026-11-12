// Cashier POS Logic
let currentSettings = null;
let selectedMember = null;
let allRewards = [];
let html5QrScanner = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettingsAndRewards();
});

async function loadSettingsAndRewards() {
  try {
    const setRes = await api.getSettings();
    if (setRes.success) {
      currentSettings = setRes.settings;
      document.getElementById('cashierRateTag').innerText = `อัตราส่วน ${currentSettings.point_rate} บาท = 1 แต้ม • ${currentSettings.store_name}`;
      document.getElementById('posRateSubtitle').innerText = `ระบบจะคำนวณ ${currentSettings.point_rate} บาท = 1 แต้ม อัตโนมัติ`;
      document.getElementById('posFormulaHint').innerText = `อัตราคำนวณ ${currentSettings.point_rate} บาท = 1 แต้ม`;
    }

    const rwdRes = await api.getRewards(true);
    if (rwdRes.success) {
      allRewards = rwdRes.rewards;
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
      // Stop scanner if active
      if (html5QrScanner) {
        stopScanner();
      }
    } else {
      Swal.fire({
        icon: 'info',
        title: 'ไม่พบสมาชิก',
        text: `ไม่พบข้อมูลสำหรับ "${query}" ต้องการสมัครสมาชิกใหม่ให้ลูกค้าเลยหรือไม่?`,
        showCancelButton: true,
        confirmButtonText: 'สมัครสมาชิกใหม่',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#064e3b'
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

  // Show Member Found Card
  document.getElementById('memberFoundCard').classList.remove('hidden');
  document.getElementById('posMemberName').innerText = member.name;
  document.getElementById('posMemberCode').innerText = member.member_code;
  document.getElementById('posMemberPhone').innerText = formatPhone(member.phone);
  document.getElementById('posMemberPoints').innerText = utils.formatNumber(member.points_balance);
  document.getElementById('posMemberTierBadge').innerHTML = utils.getTierBadgeHtml(member.tier);

  // Multiplier Info
  const mult = getMemberMultiplier(member.tier);
  const multBox = document.getElementById('posMultiplierInfo');
  if (mult > 1.0) {
    multBox.innerHTML = `<i class="fa-solid fa-bolt mr-1 text-amber-600"></i>โบนัส Tier ${member.tier} x${mult}`;
    multBox.classList.remove('hidden');
  } else {
    multBox.classList.add('hidden');
  }

  calculatePointsPreview();

  // Focus on amount input for fast cashier workflow
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
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'TRANSFER';
  const isCOD = paymentMethod === 'COD';

  if (isCOD) {
    document.getElementById('posPreviewPoints').innerText = `+0`;
    document.getElementById('posFormulaHint').innerHTML = `<span class="text-amber-700 font-bold">⚠️ ยอดเก็บเงินปลายทาง (COD) ไม่ได้รับแต้มสะสม</span>`;
    return;
  }

  const rate = currentSettings?.point_rate || 1.0;
  const multiplier = selectedMember ? getMemberMultiplier(selectedMember.tier) : 1.0;

  const points = Math.floor((amount / rate) * multiplier);

  document.getElementById('posPreviewPoints').innerText = `+${utils.formatNumber(points)}`;
  document.getElementById('posFormulaHint').innerText = `อัตรา ${rate} บาท = 1 แต้ม ${multiplier > 1.0 ? `(โบนัส Tier ${selectedMember.tier} x${multiplier})` : ''}`;
}

// --------------------------------------------------
// SUBMIT POS EARN POINTS
// --------------------------------------------------
async function handlePosEarnPoints() {
  // If member is not selected yet, check if text was typed in search input
  if (!selectedMember) {
    const query = document.getElementById('posMemberInput').value.trim();
    if (query) {
      const res = await api.getMember(query);
      if (res.success && res.member) {
        selectMember(res.member);
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'ยังไม่พบสมาชิก',
          text: 'กรุณากดค้นหาสมาชิก หรือกดสมัครสมาชิกใหม่ก่อนสะสมแต้ม'
        });
        return;
      }
    } else {
      Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณากรอกเบอร์โทรหรือรหัสสมาชิกลูกค้าที่ข้อ 1 ก่อน' });
      document.getElementById('posMemberInput').focus();
      return;
    }
  }

  const amount = parseFloat(document.getElementById('posAmountInput').value);
  if (!amount || amount <= 0) {
    Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณาระบุยอดเงินที่ชำระที่ถูกต้อง' });
    document.getElementById('posAmountInput').focus();
    return;
  }

  const receipt_no = document.getElementById('posReceiptNo').value.trim();
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'TRANSFER';

  const btn = document.getElementById('posEarnBtn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xl mr-2"></i>กำลังบันทึกแต้ม...`;

  try {
    const res = await api.posEarnPoints({
      identifier: selectedMember.phone,
      amount,
      receipt_no,
      payment_method: paymentMethod
    });

    if (res.success) {
      if (!res.is_cod) {
        utils.playSuccessSound();
        utils.fireConfetti();
      }

      let upgradeHtml = '';
      if (res.is_upgraded) {
        upgradeHtml = `
          <div class="mt-3 p-3 bg-gradient-to-r from-amber-100 to-amber-200 border border-amber-300 rounded-xl text-amber-900 font-bold text-center">
            🎉 ยินดีด้วย! สมาชิกได้รับการเลื่อนระดับเป็น <u>${res.new_tier}</u>
          </div>
        `;
      }

      await Swal.fire({
        icon: res.is_cod ? 'info' : 'success',
        title: res.is_cod ? 'บันทึกออเดอร์ปลายทาง (COD)' : 'สะสมแต้มสำเร็จ!',
        html: `
          <div class="text-left space-y-1.5 text-sm">
            <p>ลูกค้า: <strong>${escapeHtml(res.member.name)}</strong></p>
            <p>ยอดซื้อ: <strong>฿${amount.toLocaleString()}</strong></p>
            <p>การชำระ: <strong>${res.is_cod ? 'เก็บเงินปลายทาง (COD)' : 'โอนเงิน/พร้อมเพย์'}</strong></p>
            <p class="${res.is_cod ? 'text-amber-700' : 'text-emerald-800'} font-bold text-base">
              แต้มที่ได้รับ: ${res.is_cod ? '0 แต้ม (ยกเว้นแต้ม COD)' : `+${res.points_earned.toLocaleString()} แต้ม`}
            </p>
            <p>แต้มสะสมคงเหลือปัจจุบัน: <strong>${res.member.points_balance.toLocaleString()} แต้ม</strong></p>
            ${upgradeHtml}
          </div>
        `,
        confirmButtonColor: '#064e3b',
        confirmButtonText: 'ตกลง'
      });

      // Update state
      selectMember(res.member);
      document.getElementById('posAmountInput').value = '';
      document.getElementById('posReceiptNo').value = '';
      calculatePointsPreview();
    } else {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message });
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-circle-check text-xl text-[#c59b4e]"></i><span>บันทึกยอดซื้อ & สะสมแต้มเข้าบัญชีลูกค้า</span>`;
  }
}

// --------------------------------------------------
// CAMERA QR SCANNER
// --------------------------------------------------
function toggleCameraScanner() {
  const box = document.getElementById('cameraScannerBox');
  const btnText = document.getElementById('scanBtnText');

  if (box.classList.contains('hidden')) {
    box.classList.remove('hidden');
    btnText.innerText = 'ปิดกล้อง';
    startScanner();
  } else {
    stopScanner();
  }
}

function startScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    alert('ระบบกล้องไม่พร้อมใช้งาน');
    return;
  }

  html5QrScanner = new Html5Qrcode("qrReader");
  html5QrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      document.getElementById('posMemberInput').value = decodedText;
      stopScanner();
      searchMember();
    },
    (errorMessage) => {
      // Scanning... ignore frame errors
    }
  ).catch(err => {
    console.error("Camera error:", err);
    Swal.fire({ icon: 'error', title: 'เปิดกล้องไม่สำเร็จ', text: 'กรุณาอนุญาตการเข้าถึงกล้องบนเบราว์เซอร์' });
    stopScanner();
  });
}

function stopScanner() {
  if (html5QrScanner) {
    html5QrScanner.stop().then(() => {
      html5QrScanner.clear();
      html5QrScanner = null;
    }).catch(e => console.warn(e));
  }
  document.getElementById('cameraScannerBox').classList.add('hidden');
  document.getElementById('scanBtnText').innerText = 'เปิดกล้องสแกน QR';
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
            <p>ของรางวัล: <strong class="text-[#064e3b]">${res.redemption.reward_name}</strong></p>
            <p>สมาชิก: <strong>${res.redemption.member_name}</strong></p>
            <p class="text-xs text-slate-500">รหัสคูปอง: ${res.redemption.voucher_code}</p>
          </div>
        `,
        confirmButtonColor: '#064e3b'
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
