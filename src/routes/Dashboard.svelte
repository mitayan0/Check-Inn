<script lang="ts">
  import { session } from "../lib/stores/session.svelte";
  import { settings } from "../lib/stores/settings.svelte";

  // Daily Standup State
  let yesterdayWork = $state("");
  let todayFocus = $state("");
  let blockers = $state("");

  // Helper to format multi-line text with arrows
  function formatList(text: string, fallback: string) {
    if (!text.trim()) return `=> ${fallback}`;
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `=> ${line}`)
      .join("\n");
  }

  // Derived formatted message
  let formattedMessage = $derived.by(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // If fields are empty, return simplified status for Breaks/Check-out
    if (!yesterdayWork.trim() && !todayFocus.trim() && !blockers.trim()) {
      return "";
    }

    return `*** Name: ${settings.userName || "My Name"} ***
*** Daily Check-In: ${dateStr}  ${timeStr}

(1) What did you do (or, work on) yesterday (or last working day)?
${formatList(yesterdayWork, "N/A")}

(2) What did you complete and/or are you focusing on today?
${formatList(todayFocus, "N/A")}

(3) What is blocking your Progress (or, are there any Impediments)?
${formatList(blockers, "None")}`;
  });

  import { onMount } from "svelte";
  import { sidecar } from "../lib/services/sidecar.svelte";

  onMount(async () => {
    // Auto-fill yesterday's work from last session's today focus
    const lastReport = await session.getLastSessionReport();
    if (lastReport && lastReport.today) {
      yesterdayWork = lastReport.today;
    }
  });

  function handleCheckIn() {
    if (!sidecar.isWhatsAppReady) return;
    // Use the formatted message if fields are filled, otherwise simpler check-in
    const msg = formattedMessage || "Starting work";
    session.checkIn(msg, {
      yesterday: yesterdayWork,
      today: todayFocus,
      blockers: blockers,
    });
    // Clear fields optionally? Keep them for reference? Let's keep them.
  }
</script>

<div class="grid gap-6">
  <!-- Status Card -->
  <div class="bg-white p-6 rounded-[24px] shadow-sm ring-1 ring-black/5">
    <div class="flex items-center gap-4 mb-4">
      <span class="material-symbols-outlined text-4xl text-primary"
        >schedule</span
      >
      <div>
        <h2 class="text-xl font-normal text-gray-800">Daily Status</h2>
        <p class="text-sm text-gray-500">Track your work hours</p>
      </div>
    </div>

    <div class="mb-6">
      <div
        class="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1"
      >
        Current Status
      </div>
      <div class="text-3xl font-normal capitalize flex items-center gap-2">
        <span
          class="w-3 h-3 rounded-full {session.status === 'checked_in'
            ? 'bg-green-500'
            : session.status === 'break'
              ? 'bg-yellow-500'
              : 'bg-gray-400'}"
        ></span>
        {session.status.replace("_", " ")}
      </div>
    </div>

    {#if !sidecar.isWhatsAppReady}
      <div
        class="mb-6 p-4 bg-red-50 rounded-xl border border-red-100 flex items-center gap-3 text-red-600 animate-pulse"
      >
        <span class="material-symbols-outlined">warning</span>
        <div class="text-sm">
          <span class="font-bold">WhatsApp Not Connected.</span>
          Please go to <span class="underline">Settings</span> and scan the QR code
          to enable actions.
        </div>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex flex-wrap gap-3">
      <button
        onclick={handleCheckIn}
        class="h-10 px-6 rounded-full bg-primary text-on-primary font-medium hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={session.status === "checked_in" || !sidecar.isWhatsAppReady}
      >
        <span class="material-symbols-outlined text-lg">login</span>
        Check In
      </button>

      <button
        onclick={() => sidecar.isWhatsAppReady && session.startBreak()}
        class="h-10 px-6 rounded-full bg-secondary-container text-on-secondary-container font-medium hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={session.status !== "checked_in" || !sidecar.isWhatsAppReady}
      >
        <span class="material-symbols-outlined text-lg">coffee</span>
        Break
      </button>

      <button
        onclick={() => sidecar.isWhatsAppReady && session.checkOut()}
        class="h-10 px-6 rounded-full border border-gray-300 text-primary font-medium hover:bg-gray-50 transition-all flex items-center gap-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={session.status === "checked_out" || !sidecar.isWhatsAppReady}
      >
        <span class="material-symbols-outlined text-lg">logout</span>
        Check Out
      </button>
    </div>
  </div>

  <!-- Daily Standup Report -->
  <div class="bg-white p-6 rounded-[24px] shadow-sm ring-1 ring-black/5">
    <div class="flex items-center gap-4 mb-6">
      <span class="material-symbols-outlined text-3xl text-secondary"
        >assignment</span
      >
      <div>
        <h2 class="text-xl font-normal text-gray-800">Daily Standup</h2>
        <p class="text-sm text-gray-500">
          Fill out your daily report for check-in
        </p>
      </div>
    </div>

    <div class="space-y-4">
      <div>
        <label
          for="yesterday"
          class="block text-sm font-medium text-gray-700 mb-1"
        >
          (1) What did you do yesterday?
        </label>
        <textarea
          id="yesterday"
          bind:value={yesterdayWork}
          placeholder="=> Work on feature X..."
          class="w-full min-h-[80px] p-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none resize-none bg-gray-50 text-sm"
        ></textarea>
      </div>

      <div>
        <label for="today" class="block text-sm font-medium text-gray-700 mb-1">
          (2) What are you focusing on today?
        </label>
        <textarea
          id="today"
          bind:value={todayFocus}
          placeholder="=> Focus on bug fixes..."
          class="w-full min-h-[80px] p-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none resize-none bg-gray-50 text-sm"
        ></textarea>
      </div>

      <div>
        <label
          for="blockers"
          class="block text-sm font-medium text-gray-700 mb-1"
        >
          (3) Any blockers?
        </label>
        <textarea
          id="blockers"
          bind:value={blockers}
          placeholder="=> None"
          class="w-full min-h-[60px] p-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none resize-none bg-gray-50 text-sm"
        ></textarea>
      </div>

      {#if formattedMessage}
        <div
          class="mt-4 p-4 bg-primary-container/30 rounded-xl border border-primary-container"
        >
          <div
            class="text-[10px] uppercase font-bold text-primary tracking-wide mb-2"
          >
            Message Preview
          </div>
          <div
            class="font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed"
          >
            {formattedMessage}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
