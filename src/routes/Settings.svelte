<script>
  import { onMount } from "svelte";
  import QRCode from "qrcode"; // QR Code generation library
  import { settings } from "../lib/stores/settings.svelte";
  import { sidecar } from "../lib/services/sidecar.svelte";

  let newNumber = $state("");
  let qrCode = $state("");
  let isReady = $state(false);
  let isLoggingOut = $state(false);
  let isEditingTemplates = $state(false);

  onMount(() => {
    sidecar.onMessage(async (type, payload) => {
      if (type === "QR") {
        try {
          qrCode = await QRCode.toDataURL(payload);
          isReady = false;
          isLoggingOut = false;
        } catch (e) {
          console.error("QR Gen Failed", e);
        }
      }
      if (type === "READY") {
        isReady = true;
        qrCode = "";
        isLoggingOut = false;
      }
      if (type === "LOGOUT_PENDING") {
        isLoggingOut = true;
      }
      if (type === "DISCONNECTED") {
        isReady = false;
        qrCode = "";
        isLoggingOut = false;
        // Auto-restart auth flow to show QR again
        sidecar.sendInit();
      }
    });
    // Trigger a re-init to prompt for QR if needed
    sidecar.sendInit();
  });

  function handleAdd() {
    if (newNumber.trim()) {
      settings.setWhatsappNumber(newNumber.trim());
      newNumber = "";
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleAdd();
  }
</script>

<div
  class="bg-white rounded-[24px] shadow-sm ring-1 ring-black/5 overflow-hidden"
>
  <div class="p-6">
    <div class="flex items-center gap-4 mb-6">
      <span class="material-symbols-outlined text-3xl text-primary"
        >settings</span
      >
      <div>
        <h2 class="text-xl font-normal text-gray-800">Preferences</h2>
        <p class="text-sm text-gray-500">Manage your application settings</p>
      </div>
    </div>

    <div class="space-y-6">
      <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
        <h3
          class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4"
        >
          WhatsApp Connection
        </h3>

        {#if !isReady && qrCode}
          <div
            class="flex flex-col items-center justify-center p-4 bg-white rounded-lg border border-gray-200"
          >
            <div class="mb-4">
              <img src={qrCode} alt="WhatsApp QR Code" class="w-64 h-64" />
            </div>
            <p class="text-sm text-gray-600 font-medium">Scan with WhatsApp</p>
            <p class="text-xs text-gray-400 mt-1">
              Open WhatsApp > Settings > Linked Devices
            </p>
          </div>
        {:else if isReady}
          <div
            class="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200 text-green-700"
          >
            <span class="material-symbols-outlined">check_circle</span>
            <span class="font-medium">WhatsApp is connected and ready!</span>
            <button
              onclick={() => sidecar.logout()}
              disabled={isLoggingOut}
              class="ml-auto px-3 py-1 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {#if isLoggingOut}
                <span
                  class="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"
                ></span>
              {/if}
              {isLoggingOut ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        {:else}
          <div
            class="flex items-center justify-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300"
          >
            <div class="flex flex-col items-center gap-2 text-gray-400">
              <span class="material-symbols-outlined text-3xl"
                >qr_code_scanner</span
              >
              <span class="text-sm">Waiting for QR Code...</span>
              <span class="text-xs"
                >Ensure Auto-start is ON and wait a moment</span
              >
            </div>
          </div>
        {/if}
      </div>

      <!-- WhatsApp Configuration -->
      <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
        <h3
          class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4"
        >
          Delivery Settings
        </h3>

        <div class="flex flex-col gap-6">
          <div class="grid grid-cols-3 gap-3">
            <button
              onclick={() => settings.setTargetType("self")}
              class="p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 {settings.targetType ===
              'self'
                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}"
            >
              <span class="material-symbols-outlined text-3xl"
                >account_circle</span
              >
              <span class="text-xs font-bold uppercase tracking-tighter"
                >Self</span
              >
            </button>

            <button
              onclick={() => settings.setTargetType("group")}
              class="p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 {settings.targetType ===
              'group'
                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}"
            >
              <span class="material-symbols-outlined text-3xl">group</span>
              <span class="text-xs font-bold uppercase tracking-tighter"
                >Group</span
              >
            </button>

            <button
              onclick={() => settings.setTargetType("number")}
              class="p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 {settings.targetType ===
              'number'
                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}"
            >
              <span class="material-symbols-outlined text-3xl">chat</span>
              <span class="text-xs font-bold uppercase tracking-tighter"
                >Number</span
              >
            </button>
          </div>

          {#if settings.targetType === "self"}
            <div
              class="p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center gap-4"
            >
              <span class="material-symbols-outlined text-blue-500 text-3xl"
                >info</span
              >
              <div class="text-sm text-blue-700">
                <span class="font-bold">Automatic Mode:</span> Messages will be sent
                to the same WhatsApp account you used to scan the QR code.
              </div>
            </div>
          {:else if settings.targetType === "group"}
            <div class="space-y-3">
              <div class="flex items-center justify-between px-1">
                <label
                  for="groupSelect"
                  class="block text-xs font-bold text-gray-400 uppercase"
                  >Select Target Group</label
                >
                <button
                  onclick={() => sidecar.refreshGroups()}
                  class="text-[10px] font-bold text-primary uppercase hover:bg-primary/5 rounded px-2 py-1 -mr-2 transition-colors flex items-center gap-1 disabled:opacity-50"
                  disabled={sidecar.isFetchingGroups}
                >
                  <span
                    class="material-symbols-outlined text-xs {sidecar.isFetchingGroups
                      ? 'animate-spin'
                      : ''}">refresh</span
                  >
                  {sidecar.isFetchingGroups ? "Syncing..." : "Refresh List"}
                </button>
              </div>

              {#if sidecar.availableGroups.length > 0}
                <div class="relative group">
                  <select
                    id="groupSelect"
                    class="w-full h-12 pl-12 pr-10 rounded-xl border border-gray-300 appearance-none bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm font-medium"
                    value={settings.targetGroup}
                    onchange={(e) =>
                      settings.setTargetGroup(e.currentTarget.value)}
                  >
                    <option value="">-- Choose a group --</option>
                    {#each sidecar.availableGroups as g}
                      <option value={g.name}>{g.name}</option>
                    {/each}
                  </select>
                  <span
                    class="absolute inset-y-0 left-4 flex items-center text-gray-400 pointer-events-none"
                  >
                    <span class="material-symbols-outlined">groups</span>
                  </span>
                  <span
                    class="absolute inset-y-0 right-4 flex items-center text-gray-400 pointer-events-none"
                  >
                    <span class="material-symbols-outlined">expand_more</span>
                  </span>
                </div>
              {:else if sidecar.isFetchingGroups}
                <div
                  class="p-6 bg-gray-50 rounded-xl border border-gray-100 text-center flex flex-col items-center gap-2"
                >
                  <div
                    class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"
                  ></div>
                  <span class="text-[11px] text-gray-400 font-medium"
                    >Deep syncing your WhatsApp groups...</span
                  >
                  <span class="text-[10px] text-gray-300"
                    >This can take up to 20 seconds for large accounts</span
                  >
                </div>
              {:else}
                <div
                  class="p-6 bg-red-50/30 rounded-xl border border-dashed border-red-100 text-center flex flex-col items-center gap-2"
                >
                  <span class="material-symbols-outlined text-red-200 text-3xl"
                    >sentiment_dissatisfied</span
                  >
                  <span class="text-xs text-red-400 font-medium"
                    >No groups identified yet.</span
                  >
                  <p class="text-[10px] text-gray-400 max-w-[200px]">
                    Ensure you have joined groups on this WhatsApp account and
                    try clicking "Refresh List" above.
                  </p>
                </div>
              {/if}
            </div>
          {:else}
            <div class="space-y-3">
              <label
                for="mobileInput"
                class="block text-xs font-bold text-gray-400 px-1 uppercase"
                >Recipient Number</label
              >
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <span
                    class="absolute inset-y-0 left-4 flex items-center text-gray-400"
                  >
                    <span class="material-symbols-outlined text-xl">phone</span>
                  </span>
                  <input
                    id="mobileInput"
                    type="tel"
                    value={settings.whatsappNumber || ""}
                    oninput={(e) =>
                      settings.setWhatsappNumber(e.currentTarget.value)}
                    placeholder="+1234567890"
                    class="w-full pl-12 pr-4 h-12 rounded-xl border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all bg-white text-sm"
                  />
                </div>
              </div>
              <p class="text-[11px] text-gray-400 ml-1 italic font-light">
                Enter the number with country code (e.g. +1 555...)
              </p>
            </div>
          {/if}
        </div>
      </div>

      <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
        <h3
          class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4"
        >
          Personal Info
        </h3>
        <label
          for="userName"
          class="block text-xs font-medium text-gray-500 mb-1 ml-1"
          >Your Name</label
        >
        <div class="relative">
          <span
            class="absolute inset-y-0 left-3 flex items-center text-gray-400"
          >
            <span class="material-symbols-outlined text-lg">badge</span>
          </span>
          <input
            type="text"
            id="userName"
            value={settings.userName || ""}
            oninput={(e) => (settings.userName = e.currentTarget.value)}
            onchange={() => settings.save()}
            placeholder="Enter your full name"
            class="w-full pl-10 pr-4 h-10 rounded-lg border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all bg-white text-sm"
          />
        </div>
      </div>

      <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
        <div class="flex items-center justify-between mb-4">
          <h3
            class="text-sm font-medium text-gray-500 uppercase tracking-wider"
          >
            Message Templates
          </h3>
          <button
            onclick={() => (isEditingTemplates = !isEditingTemplates)}
            class="text-xs text-primary font-bold hover:underline uppercase"
          >
            {isEditingTemplates ? "Close" : "Customize"}
          </button>
        </div>

        {#if isEditingTemplates}
          <div
            class="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <p
              class="text-xs text-gray-400 mb-4 bg-white p-3 rounded-lg border border-gray-100"
            >
              Variables: <code class="bg-gray-100 px-1 rounded text-gray-600"
                >{`{time}`}</code
              >,
              <code class="bg-gray-100 px-1 rounded text-gray-600"
                >{`{name}`}</code
              >,
              <code class="bg-gray-100 px-1 rounded text-gray-600"
                >{`{date}`}</code
              >
            </p>

            <div>
              <label
                for="checkInTemplate"
                class="block text-xs font-medium text-gray-500 mb-1 ml-1"
                >Check In</label
              >
              <input
                type="text"
                id="checkInTemplate"
                bind:value={settings.checkInTemplate}
                onchange={() => settings.save()}
                class="w-full px-3 h-9 rounded-lg border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-white"
              />
            </div>
            <div>
              <label
                for="breakStartTemplate"
                class="block text-xs font-medium text-gray-500 mb-1 ml-1"
                >Break Start</label
              >
              <input
                type="text"
                id="breakStartTemplate"
                bind:value={settings.breakStartTemplate}
                onchange={() => settings.save()}
                class="w-full px-3 h-9 rounded-lg border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-white"
              />
            </div>
            <div>
              <label
                for="breakEndTemplate"
                class="block text-xs font-medium text-gray-500 mb-1 ml-1"
                >Break End / Resume</label
              >
              <input
                type="text"
                id="breakEndTemplate"
                bind:value={settings.breakEndTemplate}
                onchange={() => settings.save()}
                class="w-full px-3 h-9 rounded-lg border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-white"
              />
            </div>
            <div>
              <label
                for="checkOutTemplate"
                class="block text-xs font-medium text-gray-500 mb-1 ml-1"
                >Check Out</label
              >
              <input
                type="text"
                id="checkOutTemplate"
                bind:value={settings.checkOutTemplate}
                onchange={() => settings.save()}
                class="w-full px-3 h-9 rounded-lg border border-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-white"
              />
            </div>
          </div>
        {/if}
      </div>

      <!-- General Settings -->
      <div
        class="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
      >
        <div class="flex flex-col">
          <span class="font-medium text-gray-800">Auto-start Sidecar</span>
          <span class="text-sm text-gray-500"
            >Automatically start the WhatsApp service</span
          >
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoStart}
            onchange={() => settings.toggleAutoStart()}
            id="autostart"
            class="sr-only peer"
          />
          <div
            class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"
          ></div>
        </label>
      </div>
    </div>
  </div>
</div>
