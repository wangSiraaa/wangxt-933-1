from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class BaseModel(db.Model):
    __abstract__ = True

    def to_dict(self):
        result = {}
        for column in self.__table__.columns:
            value = getattr(self, column.name)
            if isinstance(value, datetime):
                result[column.name] = value.isoformat()
            else:
                result[column.name] = value
        return result


class RentalOrder(BaseModel):
    __tablename__ = 'rental_order'

    id = db.Column(db.String(64), primary_key=True)
    order_no = db.Column(db.String(64), unique=True, nullable=False)
    customer_name = db.Column(db.String(128), nullable=False)
    equipment_name = db.Column(db.String(128), nullable=False)
    equipment_code = db.Column(db.String(64), nullable=False)
    deposit_amount = db.Column(db.Float, nullable=False, default=0)
    rental_start_date = db.Column(db.DateTime, nullable=False)
    rental_end_date = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(32), nullable=False, default='CREATED')
    remark = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)


class AcceptanceRecord(BaseModel):
    __tablename__ = 'acceptance_record'

    id = db.Column(db.String(64), primary_key=True)
    order_id = db.Column(db.String(64), db.ForeignKey('rental_order.id'), nullable=False)
    equipment_code = db.Column(db.String(64), nullable=False)
    accessories = db.Column(db.Text)
    damage_level = db.Column(db.String(32), default='NONE')
    overdue_days = db.Column(db.Integer, default=0)
    is_returned = db.Column(db.Boolean, default=False)
    acceptance_person = db.Column(db.String(64))
    acceptance_date = db.Column(db.DateTime)
    review_remark = db.Column(db.Text)
    is_locked = db.Column(db.Boolean, default=False)
    remark = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)


class DeductionRule(BaseModel):
    __tablename__ = 'deduction_rule'

    id = db.Column(db.String(64), primary_key=True)
    rule_code = db.Column(db.String(64), unique=True, nullable=False)
    rule_name = db.Column(db.String(128), nullable=False)
    rule_type = db.Column(db.String(32), nullable=False)
    damage_level = db.Column(db.String(32))
    amount = db.Column(db.Float, nullable=False, default=0)
    daily_rate = db.Column(db.Float, default=0)
    is_enabled = db.Column(db.Boolean, default=True)
    description = db.Column(db.String(256))
    created_at = db.Column(db.DateTime, default=datetime.now)


class DeductionItem(BaseModel):
    __tablename__ = 'deduction_item'

    id = db.Column(db.String(64), primary_key=True)
    refund_id = db.Column(db.String(64), db.ForeignKey('refund_record.id'), nullable=False)
    rule_id = db.Column(db.String(64), db.ForeignKey('deduction_rule.id'))
    deduction_type = db.Column(db.String(32), nullable=False)
    deduction_name = db.Column(db.String(128), nullable=False)
    deduction_amount = db.Column(db.Float, nullable=False, default=0)
    remark = db.Column(db.String(256))
    created_at = db.Column(db.DateTime, default=datetime.now)


class RefundRecord(BaseModel):
    __tablename__ = 'refund_record'

    id = db.Column(db.String(64), primary_key=True)
    order_id = db.Column(db.String(64), db.ForeignKey('rental_order.id'), nullable=False)
    acceptance_id = db.Column(db.String(64), db.ForeignKey('acceptance_record.id'), nullable=False)
    refund_no = db.Column(db.String(64), unique=True, nullable=False)
    deposit_amount = db.Column(db.Float, nullable=False, default=0)
    total_deduction = db.Column(db.Float, nullable=False, default=0)
    refund_amount = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(32), nullable=False, default='PENDING')
    applicant = db.Column(db.String(64))
    approver = db.Column(db.String(64))
    approval_remark = db.Column(db.Text)
    apply_time = db.Column(db.DateTime)
    approval_time = db.Column(db.DateTime)
    remark = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)


class StatusTimeline(BaseModel):
    __tablename__ = 'status_timeline'

    id = db.Column(db.String(64), primary_key=True)
    order_id = db.Column(db.String(64), db.ForeignKey('rental_order.id'), nullable=False)
    business_type = db.Column(db.String(32), nullable=False)
    status = db.Column(db.String(32), nullable=False)
    status_name = db.Column(db.String(64), nullable=False)
    operator = db.Column(db.String(64))
    remark = db.Column(db.String(256))
    created_at = db.Column(db.DateTime, default=datetime.now)
