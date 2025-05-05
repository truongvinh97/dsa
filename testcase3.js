// dummy_ota_security.js
// Chạy: node dummy_ota_security.js

const N = 40;

// Xác định khoảng giá trị (ms) cho KEYLEAK và ECDSA verify
const RANGES = {
  Trev:      [100, 300],   // thời gian thu hồi khóa
  t_verify:  [5,   10],    // thời gian xác minh ECDSA
};

// helper: random số thực trong [min,max)
function randomInRange([min, max]) {
  return Math.random() * (max - min) + min;
}

// helper: tính mean và population-stddev
function stats(arr) {
  const n = arr.length;
  const mean = arr.reduce((sum, x) => sum + x, 0) / n;
  const variance = arr.reduce((sum, x) => sum + (x - mean)**2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

// simulate số lần attack "thành công" với xác suất p
function simulateAttack(p) {
  let success = 0;
  for (let i = 0; i < N; i++) {
    if (Math.random() < p) success++;
  }
  return success;
}

// simulate KEYLEAK: thu thập Trev và t_verify trên N lần
function simulateKeyLeak() {
  const Trev_list = [];
  const t_verify_list = [];
  for (let i = 0; i < N; i++) {
    Trev_list.push(randomInRange(RANGES.Trev));
    t_verify_list.push(randomInRange(RANGES.t_verify));
  }
  return {
    Trev:      stats(Trev_list),
    t_verify: stats(t_verify_list),
    raw: { Trev_list, t_verify_list }
  };
}

(async function main() {
  console.log(`\n=== Security for OTA model (N=${N}) ===\n`);

  // 1) MITM: giả định xác suất thành công attack 10%
  const A_MITM    = simulateAttack(0.10);
  const R_e_MITM  = (A_MITM / N * 100).toFixed(1);

  // 2) REPLAY: giả định xác suất thành công attack 5%
  const A_REPLAY  = simulateAttack(0.05);
  const R_e_REPLAY= (A_REPLAY / N * 100).toFixed(1);

  // 3) KEYLEAK
  const { Trev, t_verify } = simulateKeyLeak();

  // In kết quả MITM & REPLAY
  console.log(`Case    N     A   Rₑ (%)`);
  console.log(`MITM     ${N.toString().padStart(4)} ${A_MITM.toString().padStart(4)} ${R_e_MITM.toString().padStart(8)}`);
  console.log(`REPLAY   ${N.toString().padStart(4)} ${A_REPLAY.toString().padStart(4)} ${R_e_REPLAY.toString().padStart(8)}`);

  // In kết quả KEYLEAK
  console.log(`\nKEYLEAK (revoke):`);
  console.log(`  Trev (ms): min=${Math.min(...t_verify_list=[])}….`);
  console.log(`  Tₑᵥ (ms):  min=${Trev.std.toFixed(1)}  max=${Trev.mean.toFixed(1)}  mean=${Trev.mean.toFixed(1)} ±${Trev.std.toFixed(1)}`);
  console.log(`  Δtsign (ECDSA verify σ): ${t_verify.std.toFixed(1)} ms\n`);
})();
