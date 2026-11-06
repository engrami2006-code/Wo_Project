import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, tone = 'danger', loading, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      role="alertdialog"
      dismissible={!loading}
      icon={<AlertTriangle className="h-5 w-5 text-earth" aria-hidden />}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading} data-autofocus>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-muted">{message}</div>
    </Modal>
  );
}
