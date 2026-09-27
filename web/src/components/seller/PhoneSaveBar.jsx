/**
 * Phones: Cancel and Save changes, pinned to the bottom of a settings page
 * that edits one thing. Save stays off until something changed.
 */
export default function PhoneSaveBar({
  onCancel,
  onSave,
  saving = false,
  canSave = true,
  saveLabel = 'Save changes',
}) {
  return (
    <div className="scm-savebar" role="group" aria-label="Save or cancel">
      <button type="button" className="scm-savebar-btn scm-savebar-cancel" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button
        type="button"
        className="scm-savebar-btn scm-savebar-save"
        onClick={onSave}
        disabled={saving || !canSave}
      >
        {saving ? 'Saving…' : saveLabel}
      </button>
    </div>
  );
}
