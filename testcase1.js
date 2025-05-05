// dummy_ota.js
// Chạy: node dummy_ota.js

const ITERATIONS = 40;

// Khoảng thời gian (ms) từ Bảng 5.3
const RANGES = {
  t_pub:    [   2,   5],
  t_dl:     [1510,1610],
  t_flash:  [1360,1440],
  t_reboot: [1150,1240],
  t_rep:    [   6,   9],
};

const metrics = {
  t_pub:    [],
  t_dl:     [],
  t_flash:  [],
  t_reboot: [],
  t_rep:    [],
  T_E2E:    [],
};

// hàm sleep bằng Promise
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// random số thực trong [min, max]
function randomInRange([min, max]) {
  return Math.random() * (max - min) + min;
}

// tính thống kê: mean và population-stddev
function stats(arr) {
  const n = arr.length;
  const mean = arr.reduce((a,b) => a + b, 0) / n;
  const variance = arr.reduce((a,x) => a + Math.pow(x - mean, 2), 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

(async function main() {
  console.log(`Bắt đầu mô phỏng ${ITERATIONS} chu trình OTA...\n`);

  for (let i = 1; i <= ITERATIONS; i++) {
    // 1. t_pub
    const t_pub = randomInRange(RANGES.t_pub);
    await sleep(t_pub);

    // 2. t_dl
    const t_dl = randomInRange(RANGES.t_dl);
    await sleep(t_dl);

    // 3. t_flash
    const t_flash = randomInRange(RANGES.t_flash);
    await sleep(t_flash);

    // 4. t_reboot
    const t_reboot = randomInRange(RANGES.t_reboot);
    await sleep(t_reboot);

    // 5. t_rep
    const t_rep = randomInRange(RANGES.t_rep);
    await sleep(t_rep);

    // tổng TE2E
    const T_E2E = t_pub + t_dl + t_flash + t_reboot + t_rep;

    // lưu metrics
    metrics.t_pub.push(t_pub);
    metrics.t_dl.push(t_dl);
    metrics.t_flash.push(t_flash);
    metrics.t_reboot.push(t_reboot);
    metrics.t_rep.push(t_rep);
    metrics.T_E2E.push(T_E2E);

    console.log(
      `Run ${i.toString().padStart(2,'0')}: ` +
      `t_pub=${t_pub.toFixed(1)} t_dl=${t_dl.toFixed(1)} ` +
      `t_flash=${t_flash.toFixed(1)} t_reboot=${t_reboot.toFixed(1)} ` +
      `t_rep=${t_rep.toFixed(1)} | TE2E=${T_E2E.toFixed(1)} ms`
    );
  }

  // In báo cáo cuối
  console.log(`\n=== KẾT QUẢ SAU ${ITERATIONS} CHU TRÌNH ===`);
  console.log(`Param       Min (ms)  Max (ms)   Mean ± σ (ms)`);
  for (const key of ['t_pub','t_dl','t_flash','t_reboot','t_rep','T_E2E']) {
    const arr = metrics[key];
    const mn = Math.min(...arr);
    const mx = Math.max(...arr);
    const { mean, std } = stats(arr);
    console.log(
      `${key.padEnd(10,' ')} ` +
      `${mn.toFixed(0).padStart(8,' ')} ` +
      `${mx.toFixed(0).padStart(8,' ')} ` +
      `${mean.toFixed(1).padStart(7,' ')} ± ${std.toFixed(1)}`
    );
  }
})();
