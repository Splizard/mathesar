from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Remember how each person last left each table, so that coming back to it is coming back to
    it as it was left. See UserTableView.
    """

    dependencies = [
        ('mathesar', '0020_agent_certificates'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserTableView',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('table_oid', models.PositiveBigIntegerField()),
                ('filtering', models.JSONField(null=True)),
                ('hidden_columns', models.JSONField(null=True)),
                ('database', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='mathesar.database')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name='usertableview',
            constraint=models.UniqueConstraint(fields=('user', 'database', 'table_oid'), name='unique_user_table_view'),
        ),
    ]
