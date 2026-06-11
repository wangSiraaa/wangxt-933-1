import uuid
from datetime import datetime, timedelta
from models import db, RentalOrder, AcceptanceRecord, DeductionRule, DeductionItem, RefundRecord, StatusTimeline


def generate_id():
    return str(uuid.uuid4()).replace('-', '')


def generate_order_no():
    return f"RO{datetime.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:6].upper()}"


def generate_refund_no():
    return f"RF{datetime.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:6].upper()}"


class OrderService:

    @staticmethod
    def create_order(data):
        order_id = generate_id()
        order_no = generate_order_no()

        order = RentalOrder(
            id=order_id,
            order_no=order_no,
            customer_name=data.get('customer_name', ''),
            equipment_name=data.get('equipment_name', ''),
            equipment_code=data.get('equipment_code', ''),
            deposit_amount=float(data.get('deposit_amount', 0)),
            rental_start_date=datetime.strptime(data['rental_start_date'], '%Y-%m-%d') if data.get('rental_start_date') else datetime.now(),
            rental_end_date=datetime.strptime(data['rental_end_date'], '%Y-%m-%d') if data.get('rental_end_date') else datetime.now() + timedelta(days=30),
            status='DEPOSIT_PAID',
            remark=data.get('remark', '')
        )
        db.session.add(order)
        db.session.flush()

        TimelineService.add_timeline(
            order_id=order_id,
            business_type='ORDER',
            status='DEPOSIT_PAID',
            status_name='押金已缴纳',
            operator=data.get('operator', '系统'),
            remark='客户下单并缴纳押金'
        )

        db.session.commit()
        return order

    @staticmethod
    def get_order_list(page=1, page_size=10, status=None, keyword=None):
        query = RentalOrder.query
        if status:
            query = query.filter(RentalOrder.status == status)
        if keyword:
            query = query.filter(
                db.or_(
                    RentalOrder.order_no.like(f'%{keyword}%'),
                    RentalOrder.customer_name.like(f'%{keyword}%'),
                    RentalOrder.equipment_name.like(f'%{keyword}%')
                )
            )
        total = query.count()
        orders = query.order_by(RentalOrder.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            'total': total,
            'page': page,
            'page_size': page_size,
            'list': [o.to_dict() for o in orders]
        }

    @staticmethod
    def get_order_detail(order_id):
        order = RentalOrder.query.get(order_id)
        if not order:
            return None
        result = order.to_dict().copy()
        acceptance = AcceptanceRecord.query.filter_by(order_id=order_id).first()
        result['acceptance'] = acceptance.to_dict() if acceptance else None
        refund = RefundRecord.query.filter_by(order_id=order_id).first()
        result['refund'] = refund.to_dict() if refund else None
        if refund:
            deduction_items = DeductionItem.query.filter_by(refund_id=refund.id).all()
            result['deduction_items'] = [item.to_dict() for item in deduction_items]
        else:
            result['deduction_items'] = []
        timelines = StatusTimeline.query.filter_by(order_id=order_id).order_by(StatusTimeline.created_at.asc()).all()
        result['timelines'] = [t.to_dict() for t in timelines]
        return result


class AcceptanceService:

    @staticmethod
    def create_acceptance(order_id, data):
        order = RentalOrder.query.get(order_id)
        if not order:
            raise ValueError('订单不存在')

        existing = AcceptanceRecord.query.filter_by(order_id=order_id).first()
        if existing:
            raise ValueError('该订单已有验收记录')

        acceptance_id = generate_id()
        acceptance = AcceptanceRecord(
            id=acceptance_id,
            order_id=order_id,
            equipment_code=data.get('equipment_code', order.equipment_code),
            accessories=data.get('accessories', ''),
            damage_level=data.get('damage_level', 'NONE'),
            overdue_days=int(data.get('overdue_days', 0)),
            is_returned=bool(data.get('is_returned', False)),
            acceptance_person=data.get('acceptance_person', ''),
            acceptance_date=datetime.now(),
            remark=data.get('remark', '')
        )
        db.session.add(acceptance)

        order.status = 'ACCEPTED'
        order.updated_at = datetime.now()

        TimelineService.add_timeline(
            order_id=order_id,
            business_type='ACCEPTANCE',
            status='ACCEPTED',
            status_name='仓库验收完成',
            operator=data.get('acceptance_person', '系统'),
            remark='设备归还验收完成'
        )

        db.session.commit()
        return acceptance

    @staticmethod
    def update_acceptance(acceptance_id, data):
        acceptance = AcceptanceRecord.query.get(acceptance_id)
        if not acceptance:
            raise ValueError('验收记录不存在')
        if acceptance.is_locked:
            raise ValueError('验收记录已锁定，无法修改，仅可追加复核说明')

        acceptance.equipment_code = data.get('equipment_code', acceptance.equipment_code)
        acceptance.accessories = data.get('accessories', acceptance.accessories)
        acceptance.damage_level = data.get('damage_level', acceptance.damage_level)
        acceptance.overdue_days = int(data.get('overdue_days', acceptance.overdue_days))
        acceptance.is_returned = bool(data.get('is_returned', acceptance.is_returned))
        acceptance.acceptance_person = data.get('acceptance_person', acceptance.acceptance_person)
        acceptance.remark = data.get('remark', acceptance.remark)
        acceptance.updated_at = datetime.now()

        db.session.commit()
        return acceptance

    @staticmethod
    def add_review_remark(acceptance_id, review_remark, operator=''):
        acceptance = AcceptanceRecord.query.get(acceptance_id)
        if not acceptance:
            raise ValueError('验收记录不存在')

        existing_remark = acceptance.review_remark or ''
        new_remark = f"{existing_remark}\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {operator}: {review_remark}" if existing_remark else f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {operator}: {review_remark}"
        acceptance.review_remark = new_remark
        acceptance.updated_at = datetime.now()

        db.session.commit()
        return acceptance

    @staticmethod
    def lock_acceptance(acceptance_id):
        acceptance = AcceptanceRecord.query.get(acceptance_id)
        if not acceptance:
            raise ValueError('验收记录不存在')
        acceptance.is_locked = True
        acceptance.updated_at = datetime.now()
        db.session.commit()
        return acceptance

    @staticmethod
    def get_acceptance_by_order(order_id):
        return AcceptanceRecord.query.filter_by(order_id=order_id).first()


class DeductionRuleService:

    @staticmethod
    def init_default_rules():
        existing = DeductionRule.query.count()
        if existing > 0:
            return

        rules = [
            DeductionRule(
                id=generate_id(),
                rule_code='DMG_NONE',
                rule_name='无损坏',
                rule_type='DAMAGE',
                damage_level='NONE',
                amount=0,
                description='设备完好，无损坏'
            ),
            DeductionRule(
                id=generate_id(),
                rule_code='DMG_MINOR',
                rule_name='轻微损坏',
                rule_type='DAMAGE',
                damage_level='MINOR',
                amount=100,
                description='轻微划痕或小部件损坏'
            ),
            DeductionRule(
                id=generate_id(),
                rule_code='DMG_MODERATE',
                rule_name='中度损坏',
                rule_type='DAMAGE',
                damage_level='MODERATE',
                amount=500,
                description='功能受损但可修复'
            ),
            DeductionRule(
                id=generate_id(),
                rule_code='DMG_SEVERE',
                rule_name='严重损坏',
                rule_type='DAMAGE',
                damage_level='SEVERE',
                amount=2000,
                description='无法修复或主要部件损坏'
            ),
            DeductionRule(
                id=generate_id(),
                rule_code='ACC_MISSING',
                rule_name='配件缺失',
                rule_type='ACCESSORY',
                amount=200,
                description='配件缺失，按件扣减'
            ),
            DeductionRule(
                id=generate_id(),
                rule_code='OVERDUE_DAILY',
                rule_name='逾期费用',
                rule_type='OVERDUE',
                daily_rate=50,
                description='逾期每日费用'
            )
        ]
        for rule in rules:
            db.session.add(rule)
        db.session.commit()

    @staticmethod
    def get_all_rules():
        rules = DeductionRule.query.filter_by(is_enabled=True).all()
        return [r.to_dict() for r in rules]

    @staticmethod
    def calculate_deductions(acceptance_id, deposit_amount):
        acceptance = AcceptanceRecord.query.get(acceptance_id)
        if not acceptance:
            raise ValueError('验收记录不存在')

        deductions = []
        total_deduction = 0

        damage_rule = DeductionRule.query.filter_by(
            rule_type='DAMAGE',
            damage_level=acceptance.damage_level,
            is_enabled=True
        ).first()
        if damage_rule and damage_rule.amount > 0:
            deductions.append({
                'deduction_type': 'DAMAGE',
                'deduction_name': f'损坏扣减-{damage_rule.rule_name}',
                'deduction_amount': damage_rule.amount,
                'rule_id': damage_rule.id,
                'remark': f'损坏等级: {acceptance.damage_level}'
            })
            total_deduction += damage_rule.amount

        if acceptance.accessories:
            accessories_list = [a.strip() for a in acceptance.accessories.split(',') if a.strip()]
            missing_count = sum(1 for a in accessories_list if '缺失' in a or '缺少' in a or '无' in a)
            if missing_count > 0:
                accessory_rule = DeductionRule.query.filter_by(
                    rule_code='ACC_MISSING',
                    is_enabled=True
                ).first()
                if accessory_rule:
                    amount = accessory_rule.amount * missing_count
                    deductions.append({
                        'deduction_type': 'ACCESSORY',
                        'deduction_name': '配件缺失扣减',
                        'deduction_amount': amount,
                        'rule_id': accessory_rule.id,
                        'remark': f'缺失配件数量: {missing_count}'
                    })
                    total_deduction += amount

        if acceptance.overdue_days > 0:
            overdue_rule = DeductionRule.query.filter_by(
                rule_code='OVERDUE_DAILY',
                is_enabled=True
            ).first()
            if overdue_rule:
                amount = overdue_rule.daily_rate * acceptance.overdue_days
                deductions.append({
                    'deduction_type': 'OVERDUE',
                    'deduction_name': '逾期费用',
                    'deduction_amount': amount,
                    'rule_id': overdue_rule.id,
                    'remark': f'逾期天数: {acceptance.overdue_days}天，每日{overdue_rule.daily_rate}元'
                })
                total_deduction += amount

        if total_deduction > deposit_amount:
            for d in deductions:
                d['deduction_amount'] = round(d['deduction_amount'] * deposit_amount / total_deduction, 2)
            total_deduction = deposit_amount

        return {
            'deductions': deductions,
            'total_deduction': round(total_deduction, 2),
            'refund_amount': round(deposit_amount - total_deduction, 2),
            'deposit_amount': deposit_amount
        }


class RefundService:

    @staticmethod
    def create_refund(order_id, data=None):
        order = RentalOrder.query.get(order_id)
        if not order:
            raise ValueError('订单不存在')

        existing_refund = RefundRecord.query.filter_by(order_id=order_id).first()
        if existing_refund:
            raise ValueError('该订单已存在退款记录，不能重复发起退款')

        acceptance = AcceptanceRecord.query.filter_by(order_id=order_id).first()
        if not acceptance:
            raise ValueError('请先完成仓库验收')

        if not acceptance.is_returned:
            raise ValueError('设备未归还，不能退还押金')

        calc_result = DeductionRuleService.calculate_deductions(
            acceptance.id,
            order.deposit_amount
        )

        refund_id = generate_id()
        refund_no = generate_refund_no()

        refund = RefundRecord(
            id=refund_id,
            order_id=order_id,
            acceptance_id=acceptance.id,
            refund_no=refund_no,
            deposit_amount=order.deposit_amount,
            total_deduction=calc_result['total_deduction'],
            refund_amount=calc_result['refund_amount'],
            status='PENDING',
            applicant=data.get('applicant', '') if data else '',
            apply_time=datetime.now(),
            remark=data.get('remark', '') if data else ''
        )
        db.session.add(refund)

        for ded in calc_result['deductions']:
            item = DeductionItem(
                id=generate_id(),
                refund_id=refund_id,
                rule_id=ded.get('rule_id'),
                deduction_type=ded['deduction_type'],
                deduction_name=ded['deduction_name'],
                deduction_amount=ded['deduction_amount'],
                remark=ded.get('remark', '')
            )
            db.session.add(item)

        order.status = 'REFUND_PENDING'
        order.updated_at = datetime.now()

        TimelineService.add_timeline(
            order_id=order_id,
            business_type='REFUND',
            status='REFUND_PENDING',
            status_name='退款审批中',
            operator=data.get('applicant', '系统') if data else '系统',
            remark='提交退款申请，等待审批'
        )

        db.session.commit()
        return refund

    @staticmethod
    def approve_refund(refund_id, data):
        refund = RefundRecord.query.get(refund_id)
        if not refund:
            raise ValueError('退款记录不存在')

        if refund.status != 'PENDING':
            raise ValueError(f'当前状态为{refund.status}，无法审批')

        is_approved = data.get('is_approved', True)
        approver = data.get('approver', '')

        if is_approved:
            refund.status = 'APPROVED'
            refund.approver = approver
            refund.approval_time = datetime.now()
            refund.approval_remark = data.get('approval_remark', '')

            order = RentalOrder.query.get(refund.order_id)
            order.status = 'REFUND_COMPLETED'
            order.updated_at = datetime.now()

            acceptance = AcceptanceRecord.query.get(refund.acceptance_id)
            acceptance.is_locked = True
            acceptance.updated_at = datetime.now()

            TimelineService.add_timeline(
                order_id=refund.order_id,
                business_type='REFUND',
                status='REFUND_COMPLETED',
                status_name='退款完成',
                operator=approver,
                remark=f'退款审批通过，退款金额: {refund.refund_amount}元'
            )
        else:
            refund.status = 'REJECTED'
            refund.approver = approver
            refund.approval_time = datetime.now()
            refund.approval_remark = data.get('approval_remark', '')

            order = RentalOrder.query.get(refund.order_id)
            order.status = 'REFUND_REJECTED'
            order.updated_at = datetime.now()

            TimelineService.add_timeline(
                order_id=refund.order_id,
                business_type='REFUND',
                status='REFUND_REJECTED',
                status_name='退款被驳回',
                operator=approver,
                remark=f'退款审批被驳回: {data.get("approval_remark", "")}'
            )

        db.session.commit()
        return refund

    @staticmethod
    def get_refund_list(page=1, page_size=10, status=None):
        query = RefundRecord.query
        if status:
            query = query.filter(RefundRecord.status == status)
        total = query.count()
        refunds = query.order_by(RefundRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            'total': total,
            'page': page,
            'page_size': page_size,
            'list': [r.to_dict() for r in refunds]
        }

    @staticmethod
    def get_refund_detail(refund_id):
        refund = RefundRecord.query.get(refund_id)
        if not refund:
            return None
        result = refund.to_dict().copy()
        deduction_items = DeductionItem.query.filter_by(refund_id=refund_id).all()
        result['deduction_items'] = [item.to_dict() for item in deduction_items]
        order = RentalOrder.query.get(refund.order_id)
        result['order'] = order.to_dict() if order else None
        acceptance = AcceptanceRecord.query.get(refund.acceptance_id)
        result['acceptance'] = acceptance.to_dict() if acceptance else None
        return result


class TimelineService:

    @staticmethod
    def add_timeline(order_id, business_type, status, status_name, operator='', remark=''):
        timeline = StatusTimeline(
            id=generate_id(),
            order_id=order_id,
            business_type=business_type,
            status=status,
            status_name=status_name,
            operator=operator,
            remark=remark
        )
        db.session.add(timeline)
        return timeline

    @staticmethod
    def get_timelines(order_id):
        timelines = StatusTimeline.query.filter_by(order_id=order_id).order_by(StatusTimeline.created_at.asc()).all()
        return [t.to_dict() for t in timelines]
