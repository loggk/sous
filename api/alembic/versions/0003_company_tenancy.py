"""company_tenancy

Revision ID: 0003_company_tenancy
Revises: 0002_user_selectable_radius
Create Date: 2026-11-04

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0003_company_tenancy'
down_revision = '0002_user_selectable_radius'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create Organizations Table
    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_organizations_name', 'organizations', ['name'])

    # 2. Add organization_id to restaurants
    op.add_column(
        'restaurants',
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # 3. Add organization_id to users and make restaurant_id nullable
    op.add_column(
        'users',
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.alter_column('users', 'restaurant_id', nullable=True)

    # 4. Create User-Restaurant Many-to-Many Assignment Table
    op.create_table(
        'user_restaurants',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_user_restaurants_user', 'user_restaurants', ['user_id'])
    op.create_index('idx_user_restaurants_restaurant', 'user_restaurants', ['restaurant_id'])

    # 5. Create Organization Invitations Table
    op.create_table(
        'organization_invitations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('restaurant_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_invitations_org_email', 'organization_invitations', ['organization_id', 'email'])

    # 6. Safe Data Backfill:
    # Generate an organization for every existing restaurant, link foreign keys, and seed user_restaurants
    op.execute("""
    DO $$
    DECLARE
        r RECORD;
        new_org_id UUID;
    BEGIN
        FOR r IN SELECT id, name FROM restaurants LOOP
            INSERT INTO organizations (id, name, created_at)
            VALUES (uuid_generate_v4(), r.name || ' Group', now())
            RETURNING id INTO new_org_id;

            UPDATE restaurants
            SET organization_id = new_org_id
            WHERE id = r.id;

            UPDATE users
            SET organization_id = new_org_id
            WHERE restaurant_id = r.id;

            INSERT INTO user_restaurants (user_id, restaurant_id, created_at)
            SELECT id, restaurant_id, now()
            FROM users
            WHERE restaurant_id = r.id
            ON CONFLICT DO NOTHING;
        END LOOP;
    END $$;
    """)

    # 7. Add foreign key constraints after backfill
    op.create_foreign_key(
        'fk_restaurants_organization_id',
        'restaurants', 'organizations',
        ['organization_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_users_organization_id',
        'users', 'organizations',
        ['organization_id'], ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_users_organization_id', 'users', type_='foreignkey')
    op.drop_constraint('fk_restaurants_organization_id', 'restaurants', type_='foreignkey')
    op.drop_table('organization_invitations')
    op.drop_table('user_restaurants')
    op.drop_column('users', 'organization_id')
    op.drop_column('restaurants', 'organization_id')
    op.drop_table('organizations')
