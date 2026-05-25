#!/bin/bash

# claude 한테 짜달라고 했음 ㅇㅂㅇ

# URL Shortener 전체 테스트 실행 스크립트
# 사용법: ./run-all-tests.sh

set -e  # 에러 발생 시 즉시 중단

API_URL="http://localhost:8080"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🧪 URL Shortener 테스트 시작"
echo "======================================"
echo ""

# 서버 health check (선택적)
echo "🔍 API 서버 연결 확인..."
if ! curl -f -s "$API_URL/api/resolve/test" > /dev/null 2>&1; then
    echo "⚠️  경고: API 서버가 응답하지 않습니다."
    echo "   서버가 실행 중인지 확인하세요: pnpm --filter api dev"
    echo ""
fi

# 테스트 카운터
TOTAL=0
PASSED=0
FAILED=0

# 테스트 실행 함수
run_test() {
    local test_file=$1
    local test_name=$(echo "$test_file" | sed 's/_/ /g' | sed 's/.test.mjs//')
    
    TOTAL=$((TOTAL + 1))
    echo "[$TOTAL/7] 실행 중: $test_name"
    echo "----------------------------------------"
    
    if node "$TEST_DIR/$test_file"; then
        PASSED=$((PASSED + 1))
        echo ""
    else
        FAILED=$((FAILED + 1))
        echo "❌ 테스트 실패: $test_file"
        echo ""
        exit 1
    fi
}

# 테스트 순차 실행
run_test "1_shorten_concurrent.test.mjs"
run_test "2_click_limit_concurrent.test.mjs"
run_test "3_load_test.mjs"
run_test "4_expiration.test.mjs"

# Rate Limit 테스트 전 경고
echo "⏸️  Rate Limit 테스트 전 잠깐!"
echo "   이전 테스트에서 Rate Limit이 걸렸을 수 있습니다."
echo "   5초 대기 후 계속..."
sleep 5

run_test "5_rate_limit.test.mjs"
run_test "6_error_cases.test.mjs"
run_test "7_worker.test.mjs"

# 결과 출력
echo ""
echo "======================================"
echo "🎉 모든 테스트 완료!"
echo "======================================"
echo "총 테스트: $TOTAL"
echo "통과: $PASSED ✅"
echo "실패: $FAILED ❌"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎊 축하합니다! 모든 테스트가 통과했습니다."
    exit 0
else
    echo "⚠️  일부 테스트가 실패했습니다."
    exit 1
fi
