/**
 * Danger Zone Island
 *
 * Interactive buttons for regenerating API key and deleting account.
 * Handles modals and API calls.
 *
 * @module web/islands/DangerZoneIsland
 */

import { useSignal } from "@preact/signals";

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
    <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000]" onClick={handleOverlayClick}>
      <div class="bg-stone-900 rounded-xl p-6 max-w-[450px] w-[90%]" onClick={handleContentClick}>
        <h2 class="text-xl font-semibold mb-4 text-stone-100">{title}</h2>
        {children}
        <div class="flex justify-end gap-3">{actions}</div>
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
    <div class="flex justify-between items-center gap-4 p-4 bg-stone-950 border border-red-400/10 rounded-lg max-sm:flex-col max-sm:items-start">
      <div>
        <h3 class="text-[0.9rem] font-semibold mb-1 text-stone-100">{title}</h3>
        <p class="text-[0.8rem] text-stone-400 m-0">{description}</p>
      </div>
      <button type="button" class={buttonClass} onClick={onClick}>
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
    <div>
      <div class="flex flex-col gap-4">
        <DangerItem
          title="Regenerate API Key"
          description="This will invalidate your current API key. Any applications using the old key will stop working."
          buttonText="Regenerate Key"
          buttonClass="py-2.5 px-5 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-200 whitespace-nowrap bg-red-400 text-white border-none hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed max-sm:w-full"
          onClick={() => (showRegenerateModal.value = true)}
        />
        <DangerItem
          title="Delete Account"
          description="Permanently delete your account and all associated data. This action cannot be undone."
          buttonText="Delete Account"
          buttonClass="py-2.5 px-5 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-200 whitespace-nowrap bg-transparent text-red-400 border border-red-400 hover:bg-red-400/10 max-sm:w-full"
          onClick={() => (showDeleteModal.value = true)}
        />
      </div>

      {showRegenerateModal.value && (
        <Modal
          title="Regenerate API Key?"
          onClose={() => (showRegenerateModal.value = false)}
          actions={
            <>
              <button
                type="button"
                class="py-2.5 px-5 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-200 whitespace-nowrap bg-transparent text-stone-400 border border-amber-500/10 hover:border-stone-400"
                onClick={() => (showRegenerateModal.value = false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="py-2.5 px-5 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-200 whitespace-nowrap bg-red-400 text-white border-none hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleRegenerate}
                disabled={isLoading.value}
              >
                {isLoading.value ? "..." : "Regenerate"}
              </button>
            </>
          }
        >
          <p class="text-stone-400 text-[0.9rem] mb-4">
            Your current API key will be permanently invalidated. Any applications using the old
            key will stop working immediately.
          </p>
        </Modal>
      )}

      {showDeleteModal.value && (
        <Modal
          title="Delete Account?"
          onClose={closeDeleteModal}
          actions={
            <>
              <button type="button" class="py-2.5 px-5 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-200 whitespace-nowrap bg-transparent text-stone-400 border border-amber-500/10 hover:border-stone-400" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button
                type="button"
                class="py-2.5 px-5 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-200 whitespace-nowrap bg-red-400 text-white border-none hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleDelete}
                disabled={isLoading.value}
              >
                {isLoading.value ? "..." : "Delete Account"}
              </button>
            </>
          }
        >
          <p class="text-stone-400 text-[0.9rem] mb-4">
            This will permanently delete your account and anonymize all associated data. This
            action cannot be undone.
          </p>
          <p class="font-medium text-stone-100 mb-4">
            Type <strong>{DELETE_CONFIRMATION_TEXT}</strong> to confirm:
          </p>
          <input
            type="text"
            class="w-full p-3 font-mono text-[0.9rem] bg-stone-950 border border-amber-500/10 rounded-lg text-stone-100 mb-4 outline-none focus:border-red-400"
            placeholder={DELETE_CONFIRMATION_TEXT}
            value={deleteConfirmText.value}
            onInput={handleConfirmInput}
          />
        </Modal>
      )}
    </div>
  );
}
