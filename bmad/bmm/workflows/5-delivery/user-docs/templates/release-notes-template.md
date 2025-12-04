# {project_name} Release Notes

## Version {version} ({release_date})

{version_headline}

### New Features

- **{feature_1_title}** - {feature_1_description} ([docs](./user-guide.md#{feature_1_anchor}))
- **{feature_2_title}** - {feature_2_description}

### Improvements

- {improvement_1}
- {improvement_2}
- {improvement_3}

### Bug Fixes

- Fixed {bug_fix_1} ([#{issue_number_1}]({issue_link_1}))
- Fixed {bug_fix_2}
- Fixed {bug_fix_3}

### Breaking Changes

> **Action Required:** {breaking_change_summary}

- **{breaking_change_1_title}**

  {breaking_change_1_description}

  **Migration:**
  ```
  {migration_example_1}
  ```

### Deprecations

- `{deprecated_feature}` is deprecated and will be removed in v{removal_version}. Use `{replacement}` instead.

### Known Issues

- {known_issue_1}
- {known_issue_2}

---

## Version {previous_version} ({previous_release_date})

{previous_version_headline}

### New Features

- {previous_feature_1}
- {previous_feature_2}

### Improvements

- {previous_improvement_1}

### Bug Fixes

- {previous_bug_fix_1}

---

## Upgrade Guide

### From {old_version} to {new_version}

1. **Backup your configuration**
   ```bash
   {backup_command}
   ```

2. **Update {project_name}**
   ```bash
   {update_command}
   ```

3. **Run migrations (if applicable)**
   ```bash
   {migration_command}
   ```

4. **Verify the upgrade**
   ```bash
   {verify_command}
   ```

---

## Version Support

| Version | Status | Support Until |
|---------|--------|---------------|
| {version} | Active | Current |
| {previous_version} | Maintained | {support_end_date} |
| {old_version} | End of Life | - |

---

## Changelog Archive

- [v{older_version_1} Release Notes]({archive_link_1})
- [v{older_version_2} Release Notes]({archive_link_2})
- [Full Changelog]({full_changelog_link})
