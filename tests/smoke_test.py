import pytest
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import app, db, init_db
from models import RentalOrder, AcceptanceRecord, RefundRecord, DeductionRule
from services import OrderService, AcceptanceService, RefundService, DeductionRuleService


@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'

    with app.test_client() as client:
        with app.app_context():
            db.create_all()
            DeductionRuleService.init_default_rules()
        yield client


@pytest.fixture
def test_order():
    with app.app_context():
        order = OrderService.create_order({
            'customer_name': '测试客户',
            'equipment_name': '测试设备',
            'equipment_code': 'EQ-TEST-001',
            'deposit_amount': 1000,
            'rental_start_date': '2024-01-01',
            'rental_end_date': '2024-01-31',
            'operator': '测试员'
        })
        return order.id


class TestSmokeVerification:

    def test_health_check(self, client):
        response = client.get('/api/health')
        assert response.status_code == 200
        data = response.get_json()
        assert data['code'] == 200
        assert data['data']['status'] == 'ok'
        print('✓ 健康检查通过')

    def test_unreturned_device_cannot_refund(self, client, test_order):
        print('\n--- 测试1: 设备未归还不能退押金 ---')

        with app.app_context():
            acceptance = AcceptanceService.create_acceptance(test_order, {
                'equipment_code': 'EQ-TEST-001',
                'is_returned': False,
                'damage_level': 'NONE',
                'overdue_days': 0,
                'acceptance_person': '仓管员'
            })
            print(f'✓ 创建验收记录，设备未归还: is_returned={acceptance.is_returned}')

        response = client.post('/api/refunds', json={
            'order_id': test_order,
            'applicant': '测试员'
        })

        data = response.get_json()
        print(f'✓ 发起退款，返回: code={data["code"]}, message={data["message"]}')

        assert data['code'] == 400
        assert '设备未归还' in data['message']

        with app.app_context():
            refund_count = RefundRecord.query.filter_by(order_id=test_order).count()
            assert refund_count == 0

        print('✓ 验证通过: 设备未归还时无法创建退款')

    def test_deduction_cannot_exceed_deposit(self, client, test_order):
        print('\n--- 测试2: 扣款不能超过押金（扣款上限）---')

        with app.app_context():
            acceptance = AcceptanceService.create_acceptance(test_order, {
                'equipment_code': 'EQ-TEST-001',
                'is_returned': True,
                'damage_level': 'SEVERE',
                'overdue_days': 100,
                'accessories': '充电器（缺失）, 数据线（缺失）, 说明书（缺失）',
                'acceptance_person': '仓管员'
            })
            print(f'✓ 创建验收记录: 严重损坏 + 逾期100天 + 3个配件缺失')

            calc_result = DeductionRuleService.calculate_deductions(acceptance.id, 1000)
            print(f'  押金: ¥1000')
            print(f'  理论扣款: 严重损坏(¥2000) + 逾期(¥50*100=¥5000) + 配件缺失(¥200*3=¥600) = ¥7600')
            print(f'  实际扣款: ¥{calc_result["total_deduction"]}')
            print(f'  退款金额: ¥{calc_result["refund_amount"]}')

            assert calc_result['total_deduction'] <= 1000
            assert calc_result['refund_amount'] >= 0
            assert abs(calc_result['total_deduction'] + calc_result['refund_amount'] - 1000) < 0.01

        print('✓ 验证通过: 扣款金额不超过押金')

    def test_refund_completed_locks_acceptance(self, client, test_order):
        print('\n--- 测试3: 退款完成后验收记录锁定，只能追加复核说明 ---')

        order_id = test_order

        with app.app_context():
            acceptance = AcceptanceService.create_acceptance(order_id, {
                'equipment_code': 'EQ-TEST-001',
                'is_returned': True,
                'damage_level': 'MINOR',
                'overdue_days': 2,
                'accessories': '充电器, 数据线',
                'acceptance_person': '仓管员'
            })
            print(f'✓ 创建验收记录: 轻微损坏 + 逾期2天')

        response = client.post('/api/refunds', json={
            'order_id': order_id,
            'applicant': '测试员'
        })
        data = response.get_json()
        refund_id = data['data']['id']
        print(f'✓ 创建退款申请: refund_id={refund_id}')

        response = client.post(f'/api/refunds/{refund_id}/approve', json={
            'is_approved': True,
            'approver': '财务王经理',
            'approval_remark': '同意退款'
        })
        data = response.get_json()
        print(f'✓ 审批通过: status={data["data"]["status"]}')

        with app.app_context():
            acceptance = AcceptanceRecord.query.filter_by(order_id=order_id).first()
            print(f'✓ 验收记录锁定状态: is_locked={acceptance.is_locked}')
            assert acceptance.is_locked == True

        print('✓ 验证: 退款通过后验收记录已锁定')

        response = client.put(f'/api/acceptance/{acceptance.id}', json={
            'damage_level': 'SEVERE',
            'remark': '尝试修改损坏等级'
        })
        data = response.get_json()
        print(f'✓ 尝试修改验收记录，返回: code={data["code"]}, message={data["message"]}')
        assert data['code'] == 400
        assert '已锁定' in data['message']

        print('✓ 验证: 锁定后无法修改验收记录')

        response = client.post(f'/api/acceptance/{acceptance.id}/review', json={
            'review_remark': '复核确认设备状态无误',
            'operator': '复核员'
        })
        data = response.get_json()
        print(f'✓ 追加复核说明，返回: code={data["code"]}')
        assert data['code'] == 200

        with app.app_context():
            acceptance = AcceptanceRecord.query.filter_by(order_id=order_id).first()
            assert acceptance.review_remark is not None
            assert '复核确认' in acceptance.review_remark
            print(f'✓ 复核说明已追加: {acceptance.review_remark[:30]}...')

        print('✓ 验证通过: 锁定后可追加复核说明，无法修改验收记录')

    def test_duplicate_refund_prevented(self, client, test_order):
        print('\n--- 测试4: 同一订单不能重复发起退款 ---')

        order_id = test_order

        with app.app_context():
            AcceptanceService.create_acceptance(order_id, {
                'equipment_code': 'EQ-TEST-001',
                'is_returned': True,
                'damage_level': 'NONE',
                'overdue_days': 0,
                'acceptance_person': '仓管员'
            })

        response1 = client.post('/api/refunds', json={
            'order_id': order_id,
            'applicant': '测试员'
        })
        data1 = response1.get_json()
        print(f'✓ 第一次退款申请: code={data1["code"]}')
        assert data1['code'] == 200

        response2 = client.post('/api/refunds', json={
            'order_id': order_id,
            'applicant': '测试员'
        })
        data2 = response2.get_json()
        print(f'✓ 第二次退款申请: code={data2["code"]}, message={data2["message"]}')
        assert data2['code'] == 400
        assert '重复发起退款' in data2['message'] or '已存在退款记录' in data2['message']

        with app.app_context():
            refund_count = RefundRecord.query.filter_by(order_id=order_id).count()
            assert refund_count == 1

        print('✓ 验证通过: 同一订单不能重复发起退款')

    def test_status_timeline_recorded(self, client, test_order):
        print('\n--- 测试5: 状态时间线记录完整 ---')

        order_id = test_order

        with app.app_context():
            AcceptanceService.create_acceptance(order_id, {
                'equipment_code': 'EQ-TEST-001',
                'is_returned': True,
                'damage_level': 'NONE',
                'overdue_days': 0,
                'acceptance_person': '仓管员'
            })

        response = client.post('/api/refunds', json={
            'order_id': order_id,
            'applicant': '测试员'
        })
        refund_id = response.get_json()['data']['id']

        client.post(f'/api/refunds/{refund_id}/approve', json={
            'is_approved': True,
            'approver': '财务王经理',
            'approval_remark': '同意退款'
        })

        response = client.get(f'/api/timelines/{order_id}')
        data = response.get_json()
        timelines = data['data']

        print(f'✓ 时间线记录数: {len(timelines)}')
        for t in timelines:
            print(f'  - {t["status_name"]} ({t["business_type"]}) - {t["created_at"]}')

        statuses = [t['status'] for t in timelines]
        assert 'DEPOSIT_PAID' in statuses
        assert 'ACCEPTED' in statuses
        assert 'REFUND_PENDING' in statuses
        assert 'REFUND_COMPLETED' in statuses

        print('✓ 验证通过: 状态时间线记录完整')


def run_smoke_tests():
    print('=' * 60)
    print('  设备租赁押金退还系统 - Smoke 测试')
    print('=' * 60)
    print()

    pytest.main([__file__, '-v', '--tb=short'])


if __name__ == '__main__':
    run_smoke_tests()
