/**
 * Danger Zone Island
 *
 * Interactive buttons for regenerating API key and deleting account.
 * Handles modals and API calls.
 *
 * @module web/islands/DangerZoneIsland
 */

import { useSignal, type Signal } from "@preact/signals";

const DELETE_CONFIRMATION_TEXT = "DELETE";

interface ModalProps {
  title: string;
  children: JSX.Element | JSX.Element[];
  onClose: () => void;
  actions: JSX.Element;
}

function Modal({ title, children, onClose, actions }: ModalProps): JSX.Element {
  function handleOverlayClick(): void {
    onClose();
  }

  function handleContentClick(e: MouseEvent): void {
    e.stopPropagation();
  }

  return (
    <div class="modal-overlay" onClick={handleOverlayClick}>
      <div class="modal-content" onClick={handleContentClick}>
        <h2>{title}</h2>
        {children}
        <div class="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

interface DangerItemProps {
  title: string;
  description: string;
  buttonText: string;
  buttonClass: string;
  onClick: () => void;
}

function DangerItem({
  title,
  description,
  buttonText,
  buttonClass,
  onClick,
}: DangerItemProps): JSX.Element {
  return (
    <div class="danger-item">
      <div class="danger-info">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <button type="button" class={`btn ${buttonClass}`} onClick={onClick}>
        {buttonText}
      </button>
    </div>
  );
}

export default function DangerZoneIsland(): JSX.Element {
  const showRegenerateModal = useSignal(false);
  const showDeleteModal = useSignal(false);
  const deleteConfirmText = useSignal("");
  const isLoading = useSignal(false);

  async function handleRegenerate(): Promise<void> {
    isLoading.value = true;
    try {
      const res = await fetch("/auth/regenerate", { method: "POST" });
      const data = await res.json();
      if (data.key) {
        showRegenerateModal.value = false;
        location.reload();
      } else {
        alert("Error: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("Error regenerating key");
    } finally {
      isLoading.value = false;
      showRegenerateModal.value = false;
    }
  }

  async function handleDelete(): Promise<void> {
    if (deleteConfirmText.value !== DELETE_CONFIRMATION_TEXT) {
      alert(`Please type ${DELETE_CONFIRMATION_TEXT} to confirm`);
      return;
    }

    isLoading.value = true;
    try {
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmText.value }),
      });
      const data = await res.json();
      if (data.success) {
        globalThis.location.href = "/";
      } else {
        alert("Error: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("Error deleting account");
    } finally {
      isLoading.value = false;
      showDeleteModal.value = false;
    }
  }

  function closeDeleteModal(): void {
    showDeleteModal.value = false;
    deleteConfirmText.value = "";
  }

  function handleConfirmInput(e: Event): void {
    deleteConfirmText.value = (e.target as HTMLInputElement).value;
  }

  return (
    <div class="danger-zone-island">
      {/* Danger Zone Content */}
      <div class="danger-content">
        <DangerItem
          title="Regenerate API Key"
          description="This will invalidate your current API key. Any applications using the old key will stop working."
          buttonText="Regenerate Key"
          buttonClass="btn-danger"
          onClick={() => (showRegenerateModal.value = true)}
        />
        <DangerItem
          title="Delete Account"
          description="Permanently delete your account and all associated data. This action cannot be undone."
          buttonText="Delete Account"
          buttonClass="btn-danger-outline"
          onClick={() => (showDeleteModal.value = true)}
        />
      </div>

      {/* Regenerate Modal */}
      {showRegenerateModal.value && (
        <Modal
          title="Regenerate API Key?"
          onClose={() => (showRegenerateModal.value = false)}
          actions={
            <>
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => (showRegenerateModal.value = false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-danger"
                onClick={handleRegenerate}
                disabled={isLoading.value}
              >
                {isLoading.value ? "..." : "Regenerate"}
              </button>
            </>
          }
        >
          <p>
            Your current API key will be permanently invalidated. Any applications using the old
            key will stop working immediately.
          </p>
        </Modal>
      )}

      {/* Delete Modal */}
      {showDeleteModal.value && (
        <Modal
          title="Delete Account?"
          onClose={closeDeleteModal}
          actions={
            <>
              <button type="button" class="btn btn-ghost" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-danger"
                onClick={handleDelete}
                disabled={isLoading.value}
              >
                {isLoading.value ? "..." : "Delete Account"}
              </button>
            </>
          }
        >
          <p>
            This will permanently delete your account and anonymize all associated data. This
            action cannot be undone.
          </p>
          <p class="confirm-text">
            Type <strong>{DELETE_CONFIRMATION_TEXT}</strong> to confirm:
          </p>
          <input
            type="text"
            class="confirm-input"
            placeholder={DELETE_CONFIRMATION_TEXT}
            value={deleteConfirmText.value}
            onInput={handleConfirmInput}
          />
        </Modal>
      )}

      <style>
        {`
          .danger-content {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .danger-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: #08080a;
            border: 1px solid rgba(248, 113, 113, 0.1);
            border-radius: 8px;
          }

          .danger-info h3 {
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 0.25rem;
            color: #f0ede8;
          }

          .danger-info p {
            font-size: 0.8rem;
            color: #a8a29e;
            margin: 0;
          }

          .btn {
            padding: 0.625rem 1.25rem;
            font-size: 0.875rem;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            font-family: 'Geist', sans-serif;
          }

          .btn-danger {
            background: #f87171;
            color: white;
            border: none;
          }

          .btn-danger:hover:not(:disabled) {
            filter: brightness(1.1);
          }

          .btn-danger:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .btn-danger-outline {
            background: transparent;
            color: #f87171;
            border: 1px solid #f87171;
          }

          .btn-danger-outline:hover {
            background: rgba(248, 113, 113, 0.1);
          }

          .btn-ghost {
            background: transparent;
            color: #a8a29e;
            border: 1px solid rgba(255, 184, 111, 0.08);
          }

          .btn-ghost:hover {
            border-color: #a8a29e;
          }

          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .modal-content {
            background: #141418;
            border-radius: 12px;
            padding: 1.5rem;
            max-width: 450px;
            width: 90%;
          }

          .modal-content h2 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #f0ede8;
          }

          .modal-content p {
            color: #a8a29e;
            font-size: 0.9rem;
            margin-bottom: 1rem;
          }

          .confirm-text {
            font-weight: 500;
            color: #f0ede8;
          }

          .confirm-input {
            width: 100%;
            padding: 0.75rem;
            font-family: 'Geist Mono', monospace;
            font-size: 0.9rem;
            background: #08080a;
            border: 1px solid rgba(255, 184, 111, 0.08);
            border-radius: 8px;
            color: #f0ede8;
            margin-bottom: 1rem;
          }

          .confirm-input:focus {
            outline: none;
            border-color: #f87171;
          }

          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
          }

          @media (max-width: 640px) {
            .danger-item {
              flex-direction: column;
              align-items: flex-start;
            }

            .danger-item .btn {
              width: 100%;
            }
          }
        `}
      </style>
    </div>
  );
}
