import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

from models import db
from services import OrderService, AcceptanceService, DeductionRuleService, RefundService, TimelineService

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL',
    'sqlite:///rental_deposit.db'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)


def success_response(data=None, message='success'):
    return jsonify({
        'code': 200,
        'message': message,
        'data': data
    })


def error_response(message='error', code=400):
    return jsonify({
        'code': code,
        'message': message,
        'data': None
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    return success_response({'status': 'ok', 'timestamp': datetime.now().isoformat()})


@app.route('/api/orders', methods=['POST'])
def create_order():
    try:
        data = request.get_json()
        order = OrderService.create_order(data)
        return success_response({'id': order.id, 'order_no': order.order_no}, '订单创建成功')
    except Exception as e:
        return error_response(str(e))


@app.route('/api/orders', methods=['GET'])
def get_orders():
    try:
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 10))
        status = request.args.get('status')
        keyword = request.args.get('keyword')
        result = OrderService.get_order_list(page, page_size, status, keyword)
        return success_response(result)
    except Exception as e:
        return error_response(str(e))


@app.route('/api/orders/<order_id>', methods=['GET'])
def get_order_detail(order_id):
    try:
        order = OrderService.get_order_detail(order_id)
        if not order:
            return error_response('订单不存在', 404)
        return success_response(order)
    except Exception as e:
        return error_response(str(e))


@app.route('/api/orders/<order_id>/acceptance', methods=['POST'])
def create_acceptance(order_id):
    try:
        data = request.get_json() or {}
        acceptance = AcceptanceService.create_acceptance(order_id, data)
        return success_response({'id': acceptance.id}, '验收记录创建成功')
    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(str(e))


@app.route('/api/acceptance/<acceptance_id>', methods=['PUT'])
def update_acceptance(acceptance_id):
    try:
        data = request.get_json() or {}
        acceptance = AcceptanceService.update_acceptance(acceptance_id, data)
        return success_response({'id': acceptance.id}, '验收记录更新成功')
    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(str(e))


@app.route('/api/acceptance/<acceptance_id>/review', methods=['POST'])
def add_review_remark(acceptance_id):
    try:
        data = request.get_json() or {}
        review_remark = data.get('review_remark', '')
        operator = data.get('operator', '')
        acceptance = AcceptanceService.add_review_remark(acceptance_id, review_remark, operator)
        return success_response({'id': acceptance.id}, '复核说明追加成功')
    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(str(e))


@app.route('/api/acceptance/order/<order_id>', methods=['GET'])
def get_acceptance_by_order(order_id):
    try:
        acceptance = AcceptanceService.get_acceptance_by_order(order_id)
        if not acceptance:
            return success_response(None)
        return success_response(acceptance.to_dict())
    except Exception as e:
        return error_response(str(e))


@app.route('/api/deduction/rules', methods=['GET'])
def get_deduction_rules():
    try:
        rules = DeductionRuleService.get_all_rules()
        return success_response(rules)
    except Exception as e:
        return error_response(str(e))


@app.route('/api/deduction/calculate', methods=['POST'])
def calculate_deductions():
    try:
        data = request.get_json() or {}
        acceptance_id = data.get('acceptance_id')
        deposit_amount = float(data.get('deposit_amount', 0))
        result = DeductionRuleService.calculate_deductions(acceptance_id, deposit_amount)
        return success_response(result)
    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(str(e))


@app.route('/api/refunds', methods=['POST'])
def create_refund():
    try:
        data = request.get_json() or {}
        order_id = data.get('order_id')
        if not order_id:
            return error_response('订单ID不能为空')
        refund = RefundService.create_refund(order_id, data)
        return success_response({'id': refund.id, 'refund_no': refund.refund_no}, '退款申请创建成功')
    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(str(e))


@app.route('/api/refunds', methods=['GET'])
def get_refunds():
    try:
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 10))
        status = request.args.get('status')
        result = RefundService.get_refund_list(page, page_size, status)
        return success_response(result)
    except Exception as e:
        return error_response(str(e))


@app.route('/api/refunds/<refund_id>', methods=['GET'])
def get_refund_detail(refund_id):
    try:
        refund = RefundService.get_refund_detail(refund_id)
        if not refund:
            return error_response('退款记录不存在', 404)
        return success_response(refund)
    except Exception as e:
        return error_response(str(e))


@app.route('/api/refunds/<refund_id>/approve', methods=['POST'])
def approve_refund(refund_id):
    try:
        data = request.get_json() or {}
        refund = RefundService.approve_refund(refund_id, data)
        return success_response({'id': refund.id, 'status': refund.status}, '审批完成')
    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        return error_response(str(e))


@app.route('/api/timelines/<order_id>', methods=['GET'])
def get_timelines(order_id):
    try:
        timelines = TimelineService.get_timelines(order_id)
        return success_response(timelines)
    except Exception as e:
        return error_response(str(e))


@app.route('/api/init-data', methods=['POST'])
def init_data():
    try:
        DeductionRuleService.init_default_rules()
        return success_response(None, '初始化数据成功')
    except Exception as e:
        return error_response(str(e))


def init_db():
    with app.app_context():
        db.create_all()
        DeductionRuleService.init_default_rules()


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
