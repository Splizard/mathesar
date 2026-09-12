# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mathesar", "0016_columnmetadata_array_delimiter"),
    ]

    operations = [
        migrations.AddField(
            model_name="columnmetadata",
            name="duration_format",
            field=models.CharField(
                choices=[("clock", "clock"), ("words", "words")],
                max_length=10,
                null=True,
            ),
        ),
    ]
