<script>
  import { session } from "../lib/stores/session.svelte";

  let sessions = $state([]);
  let isLoading = $state(true);
  let selectedIds = $state([]);

  async function loadHistory() {
    isLoading = true;
    sessions = await session.getRecentSessions();
    selectedIds = []; // clear selection
    isLoading = false;
  }

  $effect(() => {
    loadHistory();
  });

  function toggleSelection(id) {
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((i) => i !== id);
    } else {
      selectedIds = [...selectedIds, id];
    }
  }

  function toggleAll() {
    if (selectedIds.length === sessions.length) {
      selectedIds = [];
    } else {
      selectedIds = sessions.map((s) => s.id);
    }
  }

  async function handleDelete() {
    if (selectedIds.length === 0) return;

    if (
      !confirm(
        `Are you sure you want to delete ${selectedIds.length} session(s)?`,
      )
    )
      return;
    if (
      !confirm(
        "This action cannot be undone. Do you really want to delete them?",
      )
    )
      return;

    await session.deleteSessions(selectedIds);
    await loadHistory();
  }
</script>

<div
  class="bg-white rounded-[24px] shadow-sm ring-1 ring-black/5 overflow-hidden"
>
  <div class="p-6">
    <div class="flex items-center gap-4 mb-6">
      <span class="material-symbols-outlined text-3xl text-primary"
        >history</span
      >
      <div>
        <h2 class="text-xl font-normal text-gray-800">Recent Sessions</h2>
        <p class="text-sm text-gray-500">Your past activity</p>
      </div>
      <div class="ml-auto flex gap-2">
        {#if selectedIds.length > 0}
          <button
            onclick={handleDelete}
            class="h-10 px-4 rounded-full bg-red-50 border border-red-200 text-red-600 text-sm font-medium hover:bg-red-100 transition-all flex items-center gap-2"
          >
            <span class="material-symbols-outlined text-lg">delete</span>
            Delete ({selectedIds.length})
          </button>
        {/if}

        <button
          onclick={() => session.exportToCSV()}
          class="h-10 px-4 rounded-full border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-all flex items-center gap-2"
          title="Export CSV"
        >
          <span class="material-symbols-outlined text-lg">download</span>
          Export CSV
        </button>
        <button
          onclick={loadHistory}
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          disabled={isLoading}
          title="Refresh History"
        >
          <span
            class="material-symbols-outlined {isLoading ? 'animate-spin' : ''}"
            >refresh</span
          >
        </button>
      </div>
    </div>

    {#if isLoading}
      <div class="text-center py-12 text-gray-400">
        <div
          class="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"
        ></div>
        <p>Loading your history...</p>
      </div>
    {:else if sessions.length === 0}
      <div
        class="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200"
      >
        <span class="material-symbols-outlined text-4xl mb-2 opacity-50"
          >event_busy</span
        >
        <p>No sessions recorded yet.</p>
        <p class="text-xs mt-1 text-gray-400">
          Try checking out from a session first!
        </p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-50 text-gray-500 font-medium">
            <tr>
              <th class="p-3 w-10">
                <input
                  type="checkbox"
                  checked={sessions.length > 0 &&
                    selectedIds.length === sessions.length}
                  onchange={toggleAll}
                  class="rounded border-gray-300 text-primary focus:ring-primary"
                />
              </th>
              <th class="p-3">Date</th>
              <th class="p-3">Working details</th>
              <th class="p-3">Start/End</th>
              <th class="p-3 rounded-r-lg">Duration</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each sessions as s}
              <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="p-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onchange={() => toggleSelection(s.id)}
                    class="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </td>
                <td class="p-3">
                  <div class="font-medium text-gray-900">
                    {new Date(s.start_time).toLocaleDateString()}
                  </div>
                  <div
                    class="text-[10px] text-gray-400 uppercase tracking-wider"
                  >
                    {new Date(s.start_time).toLocaleDateString(undefined, {
                      weekday: "short",
                    })}
                  </div>
                </td>
                <td class="p-3 max-w-xs align-top">
                  {#if s.tasks}
                    {@const data = JSON.parse(s.tasks)}
                    {#if data.today}
                      <ul
                        class="text-[11px] leading-snug text-gray-600 space-y-1"
                      >
                        {#each data.today
                          .split("\n")
                          .filter((t) => t.trim()) as task}
                          <li class="flex items-start gap-1.5">
                            <span
                              class="mt-1 w-1 h-1 rounded-full bg-primary/40 flex-shrink-0"
                            ></span>
                            <span>{task}</span>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <span class="text-gray-400">N/A</span>
                    {/if}
                  {:else}
                    <span class="text-gray-400 italic font-light"
                      >No tasks recorded</span
                    >
                  {/if}
                </td>
                <td class="p-3 text-gray-600">
                  <div class="text-xs">
                    {new Date(s.start_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div class="text-xs text-gray-400">
                    to {s.end_time
                      ? new Date(s.end_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "..."}
                  </div>
                </td>
                <td class="p-3 font-medium text-primary whitespace-nowrap">
                  {s.duration_minutes
                    ? `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m`
                    : "---"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
