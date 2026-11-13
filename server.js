const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, calculateTier, getMultiplier } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to generate unique codes
function generateCode(prefix) {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${rand}`;
}

// ----------------------------------------------------
// 1. STATS & OVERVIEW API
// ----------------------------------------------------
app.get('/api/stats', (req, res) => {
  try {
    const memberStats = db.prepare(`
      SELECT 
        COUNT(*) as total_members,
        COALESCE(SUM(points_balance), 0) as total_points,
        COALESCE(SUM(total_spent), 0) as total_sales
      FROM members
    `).get();

    const redemptionStats = db.prepare(`
      SELECT 
        COUNT(*) as total_redemptions,
        COALESCE(SUM(points_spent), 0) as points_redeemed
      FROM redemptions
    `).get();

    const tierDistribution = db.prepare(`
      SELECT tier, COUNT(*) as count 
      FROM members 
      GROUP BY tier
    `).all();

    const recentTransactions = db.prepare(`
      SELECT t.*, m.name as member_name, m.phone as member_phone, m.member_code
      FROM transactions t
      JOIN members m ON t.member_id = m.id
      ORDER BY t.id DESC
      LIMIT 6
    `).all();

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    res.json({
      success: true,
      stats: {
        total_members: memberStats.total_members,
        total_points: memberStats.total_points,
        total_sales: memberStats.total_sales,
        total_redemptions: redemptionStats.total_redemptions,
        points_redeemed: redemptionStats.points_redeemed,
        tier_distribution: tierDistribution,
        recent_transactions: recentTransactions,
        settings
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 2. SETTINGS API
// ----------------------------------------------------
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const {
      store_name, store_tagline, point_rate, liff_url,
      silver_min, silver_multiplier,
      gold_min, gold_multiplier,
      platinum_min, platinum_multiplier,
      diamond_min, diamond_multiplier,
      line_channel_access_token, line_channel_secret,
      slipok_api_key, slipok_branch_id, store_bank_account
    } = req.body;

    db.prepare(`
      UPDATE settings SET
        store_name = ?,
        store_tagline = ?,
        point_rate = ?,
        liff_url = ?,
        silver_min = ?,
        silver_multiplier = ?,
        gold_min = ?,
        gold_multiplier = ?,
        platinum_min = ?,
        platinum_multiplier = ?,
        diamond_min = ?,
        diamond_multiplier = ?,
        line_channel_access_token = ?,
        line_channel_secret = ?,
        slipok_api_key = ?,
        slipok_branch_id = ?,
        store_bank_account = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = 1
    `).run(
      store_name || 'ระบบสะสมแต้มพรีเมียม',
      store_tagline || '',
      parseFloat(point_rate) || 1.0,
      liff_url || '',
      parseFloat(silver_min) || 0,
      parseFloat(silver_multiplier) || 1.0,
      parseFloat(gold_min) || 1000,
      parseFloat(gold_multiplier) || 1.2,
      parseFloat(platinum_min) || 3000,
      parseFloat(platinum_multiplier) || 1.5,
      parseFloat(diamond_min) || 8000,
      parseFloat(diamond_multiplier) || 2.0,
      line_channel_access_token !== undefined ? line_channel_access_token : '',
      line_channel_secret !== undefined ? line_channel_secret : '',
      slipok_api_key !== undefined ? slipok_api_key : '',
      slipok_branch_id !== undefined ? slipok_branch_id : '',
      store_bank_account !== undefined ? store_bank_account : ''
    );

    const updated = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json({ success: true, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว', settings: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 3. MEMBERS API
// ----------------------------------------------------
app.get('/api/members', (req, res) => {
  try {
    const { search, tier } = req.query;
    let query = 'SELECT * FROM members WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ? OR member_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (tier && tier !== 'ALL') {
      query += ' AND tier = ?';
      params.push(tier);
    }

    query += ' ORDER BY id DESC';

    const members = db.prepare(query).all(...params);
    res.json({ success: true, members });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/members/:id', (req, res) => {
  try {
    const param = req.params.id;
    let member;

    if (!isNaN(param)) {
      member = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(param));
    }
    if (!member) {
      member = db.prepare('SELECT * FROM members WHERE phone = ? OR member_code = ?').get(param, param);
    }

    if (!member) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลสมาชิก' });
    }

    const transactions = db.prepare(`
      SELECT * FROM transactions 
      WHERE member_id = ? 
      ORDER BY id DESC 
      LIMIT 20
    `).all(member.id);

    const redemptions = db.prepare(`
      SELECT r.*, rew.image_url 
      FROM redemptions r
      LEFT JOIN rewards rew ON r.reward_id = rew.id
      WHERE r.member_id = ? 
      ORDER BY r.id DESC
    `).all(member.id);

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    // Calculate progress to next tier
    let nextTier = null;
    let needSpent = 0;
    let progressPct = 100;

    if (member.tier === 'Silver') {
      nextTier = 'Gold';
      needSpent = Math.max(0, settings.gold_min - member.total_spent);
      progressPct = Math.min(100, Math.round((member.total_spent / settings.gold_min) * 100));
    } else if (member.tier === 'Gold') {
      nextTier = 'Platinum';
      needSpent = Math.max(0, settings.platinum_min - member.total_spent);
      const span = settings.platinum_min - settings.gold_min;
      const current = member.total_spent - settings.gold_min;
      progressPct = Math.min(100, Math.max(0, Math.round((current / span) * 100)));
    } else if (member.tier === 'Platinum') {
      nextTier = 'Diamond';
      needSpent = Math.max(0, settings.diamond_min - member.total_spent);
      const span = settings.diamond_min - settings.platinum_min;
      const current = member.total_spent - settings.platinum_min;
      progressPct = Math.min(100, Math.max(0, Math.round((current / span) * 100)));
    }

    res.json({
      success: true,
      member: {
        ...member,
        next_tier: nextTier,
        need_spent: needSpent,
        progress_pct: progressPct
      },
      transactions,
      redemptions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/members', (req, res) => {
  try {
    const { name, phone, initial_points, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อและเบอร์โทรศัพท์' });
    }

    const cleanPhone = phone.trim().replace(/[-\s]/g, '');
    const existing = db.prepare('SELECT id FROM members WHERE phone = ?').get(cleanPhone);
    if (existing) {
      return res.status(400).json({ success: false, message: 'เบอร์โทรศัพท์นี้ลงทะเบียนไปแล้ว' });
    }

    const countAll = db.prepare('SELECT COUNT(*) as count FROM members').get();
    const memberCode = `MEM-${1001 + countAll.count}`;
    const points = parseInt(initial_points) || 0;

    const result = db.prepare(`
      INSERT INTO members (member_code, name, phone, tier, total_spent, points_balance, notes, created_at)
      VALUES (?, ?, ?, 'Silver', 0, ?, ?, datetime('now', 'localtime'))
    `).run(memberCode, name.trim(), cleanPhone, points, notes || '');

    const newMemberId = result.lastInsertRowid;

    if (points > 0) {
      db.prepare(`
        INSERT INTO transactions (transaction_code, member_id, type, purchase_amount, points, balance_after, description, created_at)
        VALUES (?, ?, 'ADJUST_ADD', 0, ?, ?, 'แต้มต้อนรับสมาชิกใหม่', datetime('now', 'localtime'))
      `).run(generateCode('TXN'), newMemberId, points, points);
    }

    const newMember = db.prepare('SELECT * FROM members WHERE id = ?').get(newMemberId);
    res.json({ success: true, message: 'เพิ่มสมาชิกใหม่สำเร็จ', member: newMember });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/members/:id', (req, res) => {
  try {
    const { name, phone, tier, notes } = req.body;
    const memberId = Number(req.params.id);

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: 'ไม่พบสมาชิก' });
    }

    db.prepare(`
      UPDATE members SET
        name = ?,
        phone = ?,
        tier = ?,
        notes = ?
      WHERE id = ?
    `).run(name || member.name, phone || member.phone, tier || member.tier, notes !== undefined ? notes : member.notes, memberId);

    const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    res.json({ success: true, message: 'แก้ไขข้อมูลสำเร็จ', member: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/members/:id', (req, res) => {
  try {
    const memberId = Number(req.params.id);
    db.prepare('DELETE FROM redemptions WHERE member_id = ?').run(memberId);
    db.prepare('DELETE FROM transactions WHERE member_id = ?').run(memberId);
    db.prepare('DELETE FROM members WHERE id = ?').run(memberId);

    res.json({ success: true, message: 'ลบข้อมูลสมาชิกเรียบร้อยแล้ว' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/members/:id/adjust', (req, res) => {
  try {
    const memberId = Number(req.params.id);
    const { points, reason, type } = req.body; // type: 'add' or 'deduct'

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: 'ไม่พบสมาชิก' });
    }

    const pts = Math.abs(parseInt(points));
    if (!pts || pts <= 0) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกจำนวนแต้มที่ถูกต้อง' });
    }

    let newBalance = member.points_balance;
    let changePoints = pts;
    let txnType = 'ADJUST_ADD';

    if (type === 'deduct') {
      if (member.points_balance < pts) {
        return res.status(400).json({ success: false, message: 'แต้มคงเหลือของสมาชิกไม่เพียงพอสำหรับการหัก' });
      }
      newBalance -= pts;
      changePoints = -pts;
      txnType = 'ADJUST_SUB';
    } else {
      newBalance += pts;
    }

    db.prepare('UPDATE members SET points_balance = ? WHERE id = ?').run(newBalance, memberId);

    db.prepare(`
      INSERT INTO transactions (transaction_code, member_id, type, purchase_amount, points, balance_after, description, created_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      generateCode('TXN'),
      memberId,
      txnType,
      changePoints,
      newBalance,
      reason || (type === 'deduct' ? 'ปรับลดแต้มโดยผู้ดูแล' : 'ปรับเพิ่มแต้มโดยผู้ดูแล')
    );

    res.json({
      success: true,
      message: `${type === 'deduct' ? 'หักแต้ม' : 'เพิ่มแต้ม'} สำเร็จ`,
      new_balance: newBalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 4. POS / CASHIER POINT RECORDING API
// ----------------------------------------------------
app.post('/api/pos/earn', (req, res) => {
  try {
    const { identifier, amount, receipt_no, note, payment_method } = req.body;

    if (!identifier) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกเบอร์โทร หรือ รหัสสมาชิก' });
    }

    const purchaseAmount = parseFloat(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกยอดซื้อที่ถูกต้อง' });
    }

    // Find member
    let member = db.prepare('SELECT * FROM members WHERE phone = ? OR member_code = ?').get(identifier.trim(), identifier.trim());
    if (!member && !isNaN(identifier)) {
      member = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(identifier));
    }

    if (!member) {
      return res.status(404).json({ success: false, message: 'ไม่พบสมาชิกรหัส/เบอร์นี้ในระบบ' });
    }

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    // Check if Cash on Delivery (COD) -> Exempt from earning points!
    const isCOD = payment_method === 'COD';

    let calculatedPoints = 0;
    let multiplier = 1.0;

    if (!isCOD) {
      multiplier = getMultiplier(member.tier, settings);
      calculatedPoints = Math.floor((purchaseAmount / (settings.point_rate || 1.0)) * multiplier);
    }

    const newTotalSpent = member.total_spent + (isCOD ? 0 : purchaseAmount);
    const newPointsBalance = member.points_balance + calculatedPoints;

    // Check tier upgrade (only when paid)
    const newTier = calculateTier(newTotalSpent, settings);
    const isUpgraded = !isCOD && (newTier !== member.tier);

    // Update member record
    db.prepare(`
      UPDATE members SET
        total_spent = ?,
        points_balance = ?,
        tier = ?
      WHERE id = ?
    `).run(newTotalSpent, newPointsBalance, newTier, member.id);

    // Record transaction
    const descParts = [];
    if (isCOD) {
      descParts.push('ชำระแบบเก็บเงินปลายทาง (COD) - ไม่ได้รับแต้ม');
    } else {
      descParts.push(`ชำระผ่าน: ${payment_method || 'โอนเงิน/พร้อมเพย์'}`);
    }
    if (receipt_no) descParts.push(`ใบเสร็จ: ${receipt_no}`);
    if (note) descParts.push(note);
    if (multiplier > 1.0 && !isCOD) descParts.push(`โบนัส Tier ${member.tier} x${multiplier}`);
    const desc = descParts.join(' | ');

    const txnCode = generateCode('TXN');
    db.prepare(`
      INSERT INTO transactions (transaction_code, member_id, type, purchase_amount, points, balance_after, description, created_at)
      VALUES (?, ?, 'EARN', ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(txnCode, member.id, purchaseAmount, calculatedPoints, newPointsBalance, desc);

    const updatedMember = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id);

    res.json({
      success: true,
      is_cod: isCOD,
      message: isCOD 
        ? `บันทึกรายการสำเร็จ (ยอดเก็บเงินปลายทาง COD ไม่คำนวณแต้มสะสม)`
        : `สะสมแต้มสำเร็จ! ได้รับ +${calculatedPoints.toLocaleString()} แต้ม`,
      transaction_code: txnCode,
      points_earned: calculatedPoints,
      multiplier,
      is_upgraded: isUpgraded,
      previous_tier: member.tier,
      new_tier: newTier,
      member: updatedMember
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 5. REWARDS CATALOG API
// ----------------------------------------------------
app.get('/api/rewards', (req, res) => {
  try {
    const { active_only } = req.query;
    let query = 'SELECT * FROM rewards';
    if (active_only === 'true') {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY points_required ASC';

    const rewards = db.prepare(query).all();
    res.json({ success: true, rewards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/rewards', (req, res) => {
  try {
    const { name, description, category, points_required, stock, image_url, min_tier } = req.body;

    if (!name || !points_required) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อรางวัลและแต้มที่ต้องใช้' });
    }

    const defaultImg = 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80';

    const result = db.prepare(`
      INSERT INTO rewards (name, description, category, points_required, stock, image_url, min_tier, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
    `).run(
      name.trim(),
      description || '',
      category || 'ของพรีเมียม',
      parseInt(points_required),
      parseInt(stock) || 0,
      image_url || defaultImg,
      min_tier || 'Silver'
    );

    const newReward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, message: 'เพิ่มของรางวัลเรียบร้อยแล้ว', reward: newReward });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/rewards/:id', (req, res) => {
  try {
    const rewardId = Number(req.params.id);
    const { name, description, category, points_required, stock, image_url, min_tier, is_active } = req.body;

    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId);
    if (!reward) {
      return res.status(404).json({ success: false, message: 'ไม่พบของรางวัล' });
    }

    db.prepare(`
      UPDATE rewards SET
        name = ?,
        description = ?,
        category = ?,
        points_required = ?,
        stock = ?,
        image_url = ?,
        min_tier = ?,
        is_active = ?
      WHERE id = ?
    `).run(
      name || reward.name,
      description !== undefined ? description : reward.description,
      category || reward.category,
      points_required !== undefined ? parseInt(points_required) : reward.points_required,
      stock !== undefined ? parseInt(stock) : reward.stock,
      image_url || reward.image_url,
      min_tier || reward.min_tier,
      is_active !== undefined ? (is_active ? 1 : 0) : reward.is_active,
      rewardId
    );

    const updated = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId);
    res.json({ success: true, message: 'อัปเดตของรางวัลสำเร็จ', reward: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/rewards/:id', (req, res) => {
  try {
    const rewardId = Number(req.params.id);
    db.prepare('DELETE FROM rewards WHERE id = ?').run(rewardId);
    res.json({ success: true, message: 'ลบของรางวัลเรียบร้อยแล้ว' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 6. REDEMPTIONS & VOUCHERS API
// ----------------------------------------------------
app.post('/api/rewards/redeem', (req, res) => {
  try {
    const { member_id, reward_id } = req.body;

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(member_id));
    if (!member) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลสมาชิก' });
    }

    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(Number(reward_id));
    if (!reward) {
      return res.status(404).json({ success: false, message: 'ไม่พบของรางวัลนี้' });
    }

    if (reward.is_active === 0) {
      return res.status(400).json({ success: false, message: 'ของรางวัลนี้ปิดการแลกชั่วคราว' });
    }

    if (reward.stock <= 0) {
      return res.status(400).json({ success: false, message: 'ของรางวัลนี้สต็อกหมดแล้ว' });
    }

    if (member.points_balance < reward.points_required) {
      return res.status(400).json({
        success: false,
        message: `แต้มสะสมไม่เพียงพอ (ต้องการ ${reward.points_required.toLocaleString()} แต้ม แต่มี ${member.points_balance.toLocaleString()} แต้ม)`
      });
    }

    // Check tier eligibility (Allow all member tiers as long as points are sufficient)
    // All members (Silver, Gold, Platinum, Diamond) can redeem freely if points >= points_required

    // Deduct points & update stock
    const newBalance = member.points_balance - reward.points_required;
    const newStock = reward.stock - 1;

    db.prepare('UPDATE members SET points_balance = ? WHERE id = ?').run(newBalance, member.id);
    db.prepare('UPDATE rewards SET stock = ? WHERE id = ?').run(newStock, reward.id);

    const voucherCode = generateCode('RWD');

    // Record Redemption
    db.prepare(`
      INSERT INTO redemptions (voucher_code, member_id, reward_id, reward_name, points_spent, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now', 'localtime'))
    `).run(voucherCode, member.id, reward.id, reward.name, reward.points_required);

    // Record Transaction
    db.prepare(`
      INSERT INTO transactions (transaction_code, member_id, type, purchase_amount, points, balance_after, description, created_at)
      VALUES (?, ?, 'REDEEM', 0, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      generateCode('TXN'),
      member.id,
      -reward.points_required,
      newBalance,
      `แลกของรางวัล: ${reward.name} (รหัส: ${voucherCode})`
    );

    res.json({
      success: true,
      message: 'แลกของรางวัลสำเร็จ!',
      voucher_code: voucherCode,
      reward_name: reward.name,
      points_spent: reward.points_required,
      new_balance: newBalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/redemptions', (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.*, m.name as member_name, m.phone as member_phone, m.member_code, rew.image_url
      FROM redemptions r
      JOIN members m ON r.member_id = m.id
      LEFT JOIN rewards rew ON r.reward_id = rew.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE r.status = ?';
      params.push(status);
    }

    query += ' ORDER BY r.id DESC';

    const redemptions = db.prepare(query).all(...params);
    res.json({ success: true, redemptions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify / Mark voucher as redeemed
app.post('/api/redemptions/verify', (req, res) => {
  try {
    const { voucher_code } = req.body;

    if (!voucher_code) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสคูปอง' });
    }

    const redemption = db.prepare(`
      SELECT r.*, m.name as member_name, m.phone as member_phone
      FROM redemptions r
      JOIN members m ON r.member_id = m.id
      WHERE r.voucher_code = ?
    `).get(voucher_code.trim());

    if (!redemption) {
      return res.status(404).json({ success: false, message: 'ไม่พบรหัสคูปองนี้ในระบบ' });
    }

    if (redemption.status === 'redeemed') {
      return res.status(400).json({
        success: false,
        message: `คูปองนี้ถูกใช้งานไปแล้วเมื่อ ${redemption.redeemed_at}`,
        redemption
      });
    }

    db.prepare(`
      UPDATE redemptions SET
        status = 'redeemed',
        redeemed_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(redemption.id);

    const updated = db.prepare('SELECT * FROM redemptions WHERE id = ?').get(redemption.id);

    res.json({
      success: true,
      message: 'ยืนยันการใช้สิทธิ์คูปองเรียบร้อยแล้ว!',
      redemption: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 7. TRANSACTIONS API
// ----------------------------------------------------
app.get('/api/transactions', (req, res) => {
  try {
    const { type, limit } = req.query;
    let query = `
      SELECT t.*, m.name as member_name, m.phone as member_phone, m.member_code
      FROM transactions t
      JOIN members m ON t.member_id = m.id
    `;
    const params = [];

    if (type) {
      query += ' WHERE t.type = ?';
      params.push(type);
    }

    query += ' ORDER BY t.id DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit));
    } else {
      query += ' LIMIT 100';
    }

    const transactions = db.prepare(query).all(...params);
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 8. RESET DEMO DATA
// ----------------------------------------------------
app.post('/api/system/reset-demo', (req, res) => {
  try {
    const { clearAllData } = require('./db');
    clearAllData();
    res.json({ success: true, message: 'ล้างข้อมูลระบบเรียบร้อยแล้ว (หน้าเปล่า)' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----------------------------------------------------
// 9. LINE OA WEBHOOK (AUTO SLIP VERIFICATION & AUTO POINT)
// ----------------------------------------------------
app.post('/api/webhook/line', async (req, res) => {
  // Return 200 immediately to LINE server
  res.status(200).send('OK');

  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const events = req.body?.events || [];

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'image') {
        const lineUserId = event.source.userId;
        const messageId = event.message.id;
        const replyToken = event.replyToken;

        if (settings.line_channel_access_token && settings.slipok_api_key && settings.slipok_branch_id) {
          // Download slip image from LINE
          const imgRes = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
            headers: { 'Authorization': `Bearer ${settings.line_channel_access_token}` }
          });
          const imgBuffer = await imgRes.arrayBuffer();

          // Send to SlipOK verification API
          const formData = new FormData();
          formData.append('files', new Blob([imgBuffer], { type: 'image/jpeg' }), 'slip.jpg');

          const slipRes = await fetch(`https://api.slipok.com/api/line/apikey/${settings.slipok_branch_id}`, {
            method: 'POST',
            headers: { 'x-authorization': settings.slipok_api_key },
            body: formData
          });

          const slipData = await slipRes.json();
          if (slipData.success && slipData.data) {
            const slip = slipData.data;
            const amount = parseFloat(slip.amount);
            const transRef = slip.transRef || slip.transRefId || messageId;

            // Check duplicate slip
            const existingSlip = db.prepare('SELECT id FROM processed_slips WHERE trans_ref = ?').get(transRef);
            if (existingSlip) {
              await sendLineReply(settings.line_channel_access_token, replyToken, '⚠️ สลิปโอนเงินนี้เคยถูกใช้งานบันทึกแต้มไปแล้วค่ะ');
              continue;
            }

            // Find or register member by LINE ID
            let member = db.prepare('SELECT * FROM members WHERE notes LIKE ?').get(`%${lineUserId}%`);
            if (!member) {
              let profileName = 'ลูกค้า LINE';
              try {
                const profRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                  headers: { 'Authorization': `Bearer ${settings.line_channel_access_token}` }
                });
                const profData = await profRes.json();
                if (profData.displayName) profileName = profData.displayName;
              } catch (e) {}

              const countAll = db.prepare('SELECT COUNT(*) as count FROM members').get();
              const memberCode = `MEM-${1001 + countAll.count}`;
              const phonePlaceholder = `LINE-${lineUserId.slice(-8)}`;

              const result = db.prepare(`
                INSERT INTO members (member_code, name, phone, tier, total_spent, points_balance, notes, created_at)
                VALUES (?, ?, ?, 'Silver', 0, 0, ?, datetime('now', 'localtime'))
              `).run(memberCode, profileName, phonePlaceholder, `LINE_UID:${lineUserId}`);
              member = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
            }

            // Calculate points
            const multiplier = getMultiplier(member.tier, settings);
            const calculatedPoints = Math.floor((amount / (settings.point_rate || 1.0)) * multiplier);
            const newTotalSpent = member.total_spent + amount;
            const newPointsBalance = member.points_balance + calculatedPoints;
            const newTier = calculateTier(newTotalSpent, settings);

            db.prepare(`
              UPDATE members SET
                total_spent = ?,
                points_balance = ?,
                tier = ?
              WHERE id = ?
            `).run(newTotalSpent, newPointsBalance, newTier, member.id);

            // Record transaction
            const txnCode = generateCode('TXN');
            db.prepare(`
              INSERT INTO transactions (transaction_code, member_id, type, purchase_amount, points, balance_after, description, created_at)
              VALUES (?, ?, 'EARN', ?, ?, ?, 'สะสมแต้มอัตโนมัติจากสลิปโอนเงิน', datetime('now', 'localtime'))
            `).run(txnCode, member.id, amount, calculatedPoints, newPointsBalance);

            // Record processed slip to prevent reuse
            db.prepare(`
              INSERT INTO processed_slips (trans_ref, amount, member_id, created_at)
              VALUES (?, ?, ?, datetime('now', 'localtime'))
            `).run(transRef, amount, member.id);

            // Send celebration push message (Short & concise format)
            const liffLink = settings.liff_url || 'https://yunnan-loyalty-system.vercel.app/member.html';
            const replyMsg = `ตรวจสอบยอดโอนเงิน ฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} สำเร็จแล้วค่ะ!\n` +
              `✨ คุณได้รับแต้มสะสม +${calculatedPoints.toLocaleString()} แต้ม เรียบร้อยแล้วค่ะ\n` +
              `👉 กดเปิดดูบัตรสมาชิกของคุณได้ที่นี่: ${liffLink}`;

            await sendLineReply(settings.line_channel_access_token, replyToken, replyMsg);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error handling LINE webhook:', err);
  }
});

async function sendLineReply(channelAccessToken, replyToken, text) {
  if (!channelAccessToken || !replyToken) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }]
      })
    });
  } catch (e) {
    console.error('Error sending LINE reply:', e);
  }
}

// Fallback for SPA routing if needed
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Loyalty Reward System is running successfully!`);
    console.log(`👉 Admin Dashboard:    http://localhost:${PORT}`);
    console.log(`👉 Cashier POS Screen: http://localhost:${PORT}/cashier.html`);
    console.log(`👉 Customer Card View: http://localhost:${PORT}/member.html`);
    console.log(`====================================================`);
  });
}

module.exports = app;
