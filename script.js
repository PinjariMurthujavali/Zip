
import {
  ZipWriter,
  BlobReader
} from "https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.7.57/index.min.js";

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const fileList = document.getElementById("fileList");
const totalSize = document.getElementById("totalSize");
const compressBtn = document.getElementById("compressBtn");
const clearBtn = document.getElementById("clearBtn");

const progressArea = document.getElementById("progressArea");
const progressBar = document.getElementById("progressBar");
const percentage = document.getElementById("percentage");
const status = document.getElementById("status");
const progressDetail = document.getElementById("progressDetail");
const result = document.getElementById("result");
const errorBox = document.getElementById("error");

let files = [];
let busy = false;

function formatSize(bytes) {
  if (bytes >= 1024 ** 3)
    return (bytes / 1024 ** 3).toFixed(2) + " GB";

  if (bytes >= 1024 ** 2)
    return (bytes / 1024 ** 2).toFixed(2) + " MB";

  return (bytes / 1024).toFixed(2) + " KB";
}

function addFiles(selected) {
  if (busy) return;

  const existing = new Set(
    files.map(f => `${f.name}-${f.size}-${f.lastModified}`)
  );

  for (const file of selected) {
    const key = `${file.name}-${file.size}-${file.lastModified}`;

    if (!existing.has(key)) {
      files.push(file);
      existing.add(key);
    }
  }

  renderFiles();
}

function renderFiles() {
  fileList.innerHTML = "";

  if (!files.length) {
    fileList.innerHTML =
      '<p class="empty">No files selected yet</p>';
  }

  files.forEach(file => {
    const item = document.createElement("div");
    item.className = "file-item";

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;

    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatSize(file.size);

    item.append(name, size);
    fileList.appendChild(item);
  });

  const total = files.reduce((sum, f) => sum + f.size, 0);

  totalSize.textContent = formatSize(total);
  compressBtn.disabled = files.length === 0 || busy;
}

fileInput.addEventListener("change", e => {
  addFiles(e.target.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach(event => {
  dropZone.addEventListener(event, e => {
    e.preventDefault();
    dropZone.classList.add("drag");
  });
});

["dragleave", "drop"].forEach(event => {
  dropZone.addEventListener(event, e => {
    e.preventDefault();
    dropZone.classList.remove("drag");
  });
});

dropZone.addEventListener("drop", e => {
  addFiles(e.dataTransfer.files);
});

clearBtn.addEventListener("click", () => {
  if (busy) return;
  files = [];
  renderFiles();
  result.hidden = true;
  errorBox.hidden = true;
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setProgress(value, message) {
  const percent = Math.min(100, Math.floor(value));

  progressBar.style.width = percent + "%";
  percentage.textContent = percent + "%";
  status.textContent = message;
}

compressBtn.addEventListener("click", async () => {
  if (!files.length || busy) return;

  if (!window.showSaveFilePicker) {
    showError(
      "Large-file disk streaming requires Chrome or Edge on HTTPS or localhost. Please open this website in a supported browser."
    );
    return;
  }

  let handle;

  // Ask for the output location before starting.
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: "compressed-files.zip",
      types: [{
        description: "ZIP Archive",
        accept: { "application/zip": [".zip"] }
      }]
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    showError(err.message);
    return;
  }

  busy = true;
  compressBtn.disabled = true;
  clearBtn.disabled = true;
  fileInput.disabled = true;

  result.hidden = true;
  errorBox.hidden = true;
  progressArea.hidden = false;

  const selectedFiles = [...files];
  const total = selectedFiles.reduce(
    (sum, file) => sum + file.size, 0
  );

  let completedBytes = 0;
  let writable;

  try {
    const diskWriter = await handle.createWritable();

    // Pipe ZIP output directly to disk, avoiding a huge ZIP Blob.
    const outputStream = new TransformStream();

    const outputPromise = outputStream.readable.pipeTo(diskWriter);

    writable = new ZipWriter(
      outputStream.writable,
      {
        level: Number(document.getElementById("level").value),
        bufferedWrite: false
      }
    );

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      status.textContent = `Compressing ${i + 1} of ${selectedFiles.length}`;

      await writable.add(
        file.name,
        new BlobReader(file),
        {
          level: Number(document.getElementById("level").value),
          onprogress: (current, maximum) => {
            const currentBytes = Math.min(current, maximum || file.size);

            const overall = total
              ? ((completedBytes + currentBytes) / total) * 100
              : 100;

            setProgress(overall, `Compressing: ${file.name}`);
            progressDetail.textContent =
              `${formatSize(completedBytes + currentBytes)} of ${formatSize(total)} processed`;
          }
        }
      );

      completedBytes += file.size;

      setProgress(
        (completedBytes / total) * 100,
        `Completed ${i + 1} of ${selectedFiles.length}`
      );
    }

    status.textContent = "Finalizing ZIP archive...";

    await writable.close();
    await outputPromise;

    setProgress(100, "Compression completed!");

    result.textContent =
      `✓ ZIP file successfully created and saved! ` +
      `Original size: ${formatSize(total)}.`;

    result.hidden = false;

  } catch (err) {
    console.error(err);

    if (writable) {
      try {
        await writable.close();
      } catch (_) {}
    }

    showError(
      "Compression failed: " +
      (err.message || "Unknown error") +
      ". Check available disk space and try again."
    );

  } finally {
    busy = false;
    compressBtn.disabled = files.length === 0;
    clearBtn.disabled = false;
    fileInput.disabled = false;
  }
});

renderFiles();
