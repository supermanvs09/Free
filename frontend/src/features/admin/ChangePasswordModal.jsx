import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { changeOwnPassword } from '../../lib/api/admin';
import { Button } from '../../ui/Button';
import { Field, PasswordInput } from '../../ui/Field';
import { Modal } from '../../ui/Overlay';
import { useToast } from '../../ui/Toast';

/**
 * Change your own password. The current one is asked for (an unattended,
 * signed-in screen must not be enough to take an account over), the new one
 * twice. Other sessions are signed out; this one stays.
 */
export function ChangePasswordModal({ open, onClose }) {
  const { notify } = useToast();
  const [values, setValues] = useState({ current: '', next: '', again: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const close = () => {
    setValues({ current: '', next: '', again: '' });
    setErrors({});
    onClose();
  };
  const submit = async (event) => {
    event?.preventDefault();
    const next = {};
    if (!values.current) next.current = 'Enter your current password.';
    if (values.next.length < 12) next.next = 'Use at least 12 characters.';
    else if (values.next.length > 72) next.next = 'Use at most 72 characters.';
    else if (values.next === values.current) next.next = 'Choose a password different from the current one.';
    if (!next.next && values.again !== values.next) next.again = 'The two new passwords differ.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await changeOwnPassword({ currentPassword: values.current, newPassword: values.next });
      notify({ variant: 'success', title: 'Password changed', description: 'Your other sessions were signed out. This one stays signed in.' });
      close();
    } catch (error) {
      if (error?.field === 'current_password') setErrors({ current: error.message });
      else if (error?.field === 'new_password') setErrors({ next: error.message });
      else notify({ variant: 'error', title: 'Could not change the password', description: error?.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      icon={KeyRound}
      title="Change your password"
      description="Your other sessions are signed out; this one stays signed in."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            Change password
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Current password" htmlFor="pw-current" error={errors.current}>
          <PasswordInput id="pw-current" value={values.current} onChange={set('current')} autoComplete="current-password" invalid={Boolean(errors.current)} />
        </Field>
        <Field label="New password" htmlFor="pw-next" error={errors.next} hint="12 characters or more.">
          <PasswordInput id="pw-next" value={values.next} onChange={set('next')} autoComplete="new-password" invalid={Boolean(errors.next)} />
        </Field>
        <Field label="New password, again" htmlFor="pw-again" error={errors.again}>
          <PasswordInput id="pw-again" value={values.again} onChange={set('again')} autoComplete="new-password" invalid={Boolean(errors.again)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
