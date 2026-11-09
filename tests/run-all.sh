#!/bin/sh
# 跑全部城市测试：node tests/<城>_test.js cities/<城>.html shared.js
# ⚠️ zobeide_test.js 只打印、断言失败不改退出码——这里的 ✓ 只说明它没崩。
cd "$(dirname "$0")/.." || exit 1
fail=0; n=0
for t in tests/*_test.js; do
  c=$(basename "$t" _test.js); n=$((n+1))
  if node "$t" "cities/$c.html" shared.js >/dev/null 2>&1; then echo "✓ $c"; else echo "✗ $c"; fail=$((fail+1)); fi
done
echo "$n 个测试，$fail 个失败（cities/ 里共 $(ls cities/*.html | wc -l | tr -d ' ') 座城）"
[ $fail -eq 0 ]
