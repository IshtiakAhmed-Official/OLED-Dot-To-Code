const pixelGrid = document.getElementById('pixelGrid');
const codeOutput = document.getElementById('codeOutput');
const copyBtn = document.getElementById('copyBtn');
const colsInput = document.getElementById('colsInput');
const rowsInput = document.getElementById('rowsInput');
const controlsForm = document.getElementById('controlsForm');
const imageInput = document.getElementById('imageInput');
const selectedFileName = document.getElementById('selectedFileName');
const uploadStatus = document.getElementById('uploadStatus');
const dropArea = document.getElementById('dropArea');
const hiddenCanvas = document.getElementById('hiddenCanvas');
const ctx = hiddenCanvas.getContext('2d');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const toggleOutputBtn = document.getElementById('toggleOutputBtn');

let isDragging = false;
let dragPaintState = null;
let currentButton = null;

let isTouchDragging = false;
let touchPaintState = null;
let activeTouchId = null;

let undoStack = [];
let redoStack = [];

let currentBatch = [];

pixelGrid.addEventListener('contextmenu', e => e.preventDefault());

function updateUndoRedoButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function addChangeToCurrentBatch(row, col, prevState, newState) {
  const repeated = currentBatch.some(c => c.row === row && c.col === col && c.newState === newState);
  if (!repeated) {
    currentBatch.push({row, col, prevState, newState});
  }
}

function paintCellBatch(cell, paintOn) {
  const row = parseInt(cell.dataset.row, 10);
  const col = parseInt(cell.dataset.col, 10);
  const wasOn = cell.classList.contains('on');

  if (paintOn) {
    if (!wasOn) {
      cell.classList.add('on');
      addChangeToCurrentBatch(row, col, wasOn, true);
    }
  } else {
    if (wasOn) {
      cell.classList.remove('on');
      addChangeToCurrentBatch(row, col, wasOn, false);
    }
  }
}

function flushCurrentBatch() {
  if (currentBatch.length > 0) {
    undoStack.push(currentBatch);
    redoStack = [];
    updateUndoRedoButtons();
    currentBatch = [];
  }
}

function generateGrid(cols, rows) {
  pixelGrid.innerHTML = '';
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
  currentBatch = [];

  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.dataset.row = r;
      td.dataset.col = c;

      td.addEventListener('mousedown', e => {
        e.preventDefault();
        if (e.button === 0 || e.button === 2) {
          currentBatch = [];
          const toggledState = e.button === 0 ? !td.classList.contains('on') : false;
          paintCellBatch(td, toggledState);
          flushCurrentBatch();
          if (!codeOutput.hasAttribute('hidden')) updateCode(cols, rows);
        }
      });

      td.addEventListener('mouseenter', e => {
        if (!isDragging || dragPaintState === null) return;
        paintCellBatch(td, dragPaintState);
        if (!codeOutput.hasAttribute('hidden')) updateCode(cols, rows);
      });

      tr.appendChild(td);
    }
    pixelGrid.appendChild(tr);
  }
  if (!codeOutput.hasAttribute('hidden')) updateCode(cols, rows);
}

function updateCode(cols, rows) {
  const outputFormat = document.querySelector('input[name="outputFormat"]:checked').value;
  const lines = [];

  for (let r = 0; r < rows; r++) {
    if (outputFormat === 'binary') {
      let bits = '';
      for (let c = cols - 1; c >= 0; c--) {
        bits += pixelGrid.rows[r].cells[c].classList.contains('on') ? '1' : '0';
      }
      lines.push(`0b${bits}${r < rows - 1 ? ',' : ''}`);
    } else if (outputFormat === 'hex') {
      const byteCount = Math.ceil(cols / 8);
      let byteStrings = [];

      for (let byteIndex = 0; byteIndex < byteCount; byteIndex++) {
        let bits = '';
        for (let bit = 0; bit < 8; bit++) {
          const bitCol = (byteIndex + 1) * 8 - 1 - bit;
          if (bitCol < cols) {
            const cell = pixelGrid.rows[r].cells[bitCol];
            bits += cell.classList.contains('on') ? '1' : '0';
          } else {
            bits += '0';
          }
        }
        byteStrings.push(binToHexByte(bits));
      }
      lines.push(byteStrings.join(', ') + ',');
    }
  }
  codeOutput.textContent = lines.join('\n');
}

function binToHexByte(binStr) {
  return '0x' + parseInt(binStr, 2).toString(16).padStart(2, '0');
}

function convertImageToMonochromeGrid(image, threshold = 127) {
  const targetWidth = 128;
  const targetHeight = 64;

  uploadStatus.textContent = 'Processing image...';

  const imageRatio = image.width / image.height;
  const targetRatio = targetWidth / targetHeight;

  let drawWidth, drawHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (imageRatio > targetRatio) {
    drawWidth = targetWidth;
    drawHeight = Math.round(targetWidth / imageRatio);
    offsetY = Math.floor((targetHeight - drawHeight) / 2);
  } else {
    drawHeight = targetHeight;
    drawWidth = Math.round(targetHeight * imageRatio);
    offsetX = Math.floor((targetWidth - drawWidth) / 2);
  }

  hiddenCanvas.width = targetWidth;
  hiddenCanvas.height = targetHeight;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imageData.data;

  colsInput.value = targetWidth;
  rowsInput.value = targetHeight;
  validateInputs();
  generateGrid(targetWidth, targetHeight);

  const pixelStates = new Array(targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    pixelStates[y] = new Array(targetWidth);
    for (let x = 0; x < targetWidth; x++) {
      const index = (y * targetWidth + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      pixelStates[y][x] = luminance < threshold;
    }
  }

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const cell = pixelGrid.rows[y].cells[x];
      if (pixelStates[y][x]) {
        cell.classList.add('on');
      } else {
        cell.classList.remove('on');
      }
    }
  }

  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();

  if (!codeOutput.hasAttribute('hidden')) updateCode(targetWidth, targetHeight);
  uploadStatus.textContent = 'Image processed.';
}

undoBtn.addEventListener('click', () => {
  if (undoStack.length === 0) return;
  const batch = undoStack.pop();
  batch.forEach(change => {
    const cell = pixelGrid.rows[change.row].cells[change.col];
    if (change.prevState) {
      cell.classList.add('on');
    } else {
      cell.classList.remove('on');
    }
  });
  redoStack.push(batch);
  updateUndoRedoButtons();
  if (!codeOutput.hasAttribute('hidden')) updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
});

redoBtn.addEventListener('click', () => {
  if (redoStack.length === 0) return;
  const batch = redoStack.pop();
  batch.forEach(change => {
    const cell = pixelGrid.rows[change.row].cells[change.col];
    if (change.newState) {
      cell.classList.add('on');
    } else {
      cell.classList.remove('on');
    }
  });
  undoStack.push(batch);
  updateUndoRedoButtons();
  if (!codeOutput.hasAttribute('hidden')) updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
});

function getCellFromTouch(touch) {
  const element = document.elementFromPoint(touch.clientX, touch.clientY);
  if (element && element.tagName === 'TD' && pixelGrid.contains(element)) {
    return element;
  }
  return null;
}

pixelGrid.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    const cell = getCellFromTouch(touch);
    if (!cell) return;

    isTouchDragging = true;
    activeTouchId = touch.identifier;
    currentBatch = [];

    touchPaintState = !cell.classList.contains('on');
    paintCellBatch(cell, touchPaintState);
  }
});

pixelGrid.addEventListener('touchmove', e => {
  if (!isTouchDragging) return;

  const touch = Array.from(e.touches).find(t => t.identifier === activeTouchId);
  if (!touch) return;

  const cell = getCellFromTouch(touch);
  if (!cell) return;

  paintCellBatch(cell, touchPaintState);
});

function onTouchEndOrCancel(e) {
  const stillActive = Array.from(e.touches).some(t => t.identifier === activeTouchId);
  if (!stillActive) {
    flushCurrentBatch();
    isTouchDragging = false;
    touchPaintState = null;
    activeTouchId = null;
    if (!codeOutput.hasAttribute('hidden')) updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
  }
}
pixelGrid.addEventListener('touchend', onTouchEndOrCancel);
pixelGrid.addEventListener('touchcancel', onTouchEndOrCancel);

document.addEventListener('mousedown', e => {
  if (e.button !== 0 && e.button !== 2) return;
  if (!pixelGrid.contains(e.target)) return;

  e.preventDefault();
  isDragging = true;
  currentButton = e.button;
  dragPaintState = currentButton === 0;

  currentBatch = [];
  paintCellBatch(e.target, dragPaintState);
});

document.addEventListener('mousemove', e => {
  if (!isDragging) return;
  if (!pixelGrid.contains(e.target)) return;
  paintCellBatch(e.target, dragPaintState);
});

document.addEventListener('mouseup', e => {
  if (isDragging) {
    flushCurrentBatch();
    isDragging = false;
    currentBatch = [];
    if (!codeOutput.hasAttribute('hidden')) updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
  }
});

const generateBtn = document.getElementById('generateBtn');
const colsError = document.getElementById('colsError');
const rowsError = document.getElementById('rowsError');

function validateInputs() {
  const cols = parseInt(colsInput.value, 10);
  const rows = parseInt(rowsInput.value, 10);
  let valid = true;

  if (isNaN(cols) || cols < 1 || cols > 512) {
    colsInput.classList.add('invalid');
    colsError.style.display = 'inline';
    valid = false;
  } else {
    colsInput.classList.remove('invalid');
    colsError.style.display = 'none';
  }

  if (isNaN(rows) || rows < 1 || rows > 256) {
    rowsInput.classList.add('invalid');
    rowsError.style.display = 'inline';
    valid = false;
  } else {
    rowsInput.classList.remove('invalid');
    rowsError.style.display = 'none';
  }

  generateBtn.disabled = !valid;
  return valid;
}

colsInput.addEventListener('input', validateInputs);
rowsInput.addEventListener('input', validateInputs);

controlsForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateInputs()) return;

  const cols = parseInt(colsInput.value, 10);
  const rows = parseInt(rowsInput.value, 10);
  generateGrid(cols, rows);
});

document.querySelectorAll('input[name="outputFormat"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (validateInputs() && !codeOutput.hasAttribute('hidden')) {
      updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
    }
    radio.blur();
  });
});

// Fix: Update code before copying even if output is hidden
copyBtn.addEventListener('click', () => {
  updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));

  const textToCopy = codeOutput.textContent;
  if (!textToCopy) return;

  navigator.clipboard.writeText(textToCopy).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
    }, 1500);
  }).catch(() => {
    alert('Failed to copy. Please copy manually.');
  });
});

imageInput.addEventListener('change', e => {
  if (imageInput.files.length === 0) {
    selectedFileName.textContent = '';
    uploadStatus.textContent = '';
    return;
  }

  const file = imageInput.files[0];
  selectedFileName.textContent = `Selected file: ${file.name}`;
  uploadStatus.textContent = '';

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      convertImageToMonochromeGrid(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.src = url;
});

dropArea.addEventListener('dragover', e => {
  e.preventDefault();
  dropArea.classList.add('dragover');
});

dropArea.addEventListener('dragleave', e => {
  e.preventDefault();
  dropArea.classList.remove('dragover');
});

dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith('image/')) {
    alert('Please upload a valid image file.');
    return;
  }

  imageInput.files = files;
  selectedFileName.textContent = `Selected file: ${file.name}`;
  uploadStatus.textContent = '';

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      convertImageToMonochromeGrid(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.src = url;
});

dropArea.addEventListener('click', () => {
  imageInput.click();
});

dropArea.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    imageInput.click();
  }
});

// Toggle output box visibility (copy button always visible)
toggleOutputBtn.addEventListener('click', () => {
  const isHidden = codeOutput.hasAttribute('hidden');
  if (isHidden) {
    codeOutput.removeAttribute('hidden');
    toggleOutputBtn.textContent = 'Hide Output';
    toggleOutputBtn.setAttribute('aria-expanded', 'true');
    toggleOutputBtn.setAttribute('aria-label', 'Hide output code');
    updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
  } else {
    codeOutput.setAttribute('hidden', '');
    toggleOutputBtn.textContent = 'Show Output';
    toggleOutputBtn.setAttribute('aria-expanded', 'false');
    toggleOutputBtn.setAttribute('aria-label', 'Show output code');
  }
});

validateInputs();
generateGrid(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));

// Keyboard shortcuts for Undo/Redo
document.addEventListener('keydown', e => {
  const tagName = e.target.tagName;
  const inputType = e.target.type || '';
  if ((tagName === 'INPUT' && inputType !== 'radio') || tagName === 'TEXTAREA') return;

  if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && !e.shiftKey) {
    if (!undoBtn.disabled) {
      undoBtn.click();undoBtn.click();
      e.preventDefault();
    }
  } else if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && e.shiftKey) {
    if (!redoBtn.disabled) {
      redoBtn.click();redoBtn.click();
      e.preventDefault();
    }
  } else if (!e.ctrlKey && !e.shiftKey) {
    if (e.key === 'u' || e.key === 'U') {
      if (!undoBtn.disabled) {
        undoBtn.click();undoBtn.click();
        e.preventDefault();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      if (!redoBtn.disabled) {
        redoBtn.click();redoBtn.click();
        e.preventDefault();
      }
    }
  }
});

document.addEventListener('keydown', e => {
  // Ignore if focus is in input or textarea to avoid interfering with typing
  const tagName = e.target.tagName;
  const inputType = e.target.type || '';
  if ((tagName === 'INPUT' && inputType !== 'radio') || tagName === 'TEXTAREA') return;

  // Clear drawing on Delete key press
  if (e.key === 'Delete') {
    e.preventDefault();
    // Clear all pixels
    for (let r = 0; r < pixelGrid.rows.length; r++) {
      for (let c = 0; c < pixelGrid.rows[r].cells.length; c++) {
        pixelGrid.rows[r].cells[c].classList.remove('on');
      }
    }
    // Clear undo and redo stacks
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    // Update output if visible
    if (!codeOutput.hasAttribute('hidden')) {
      updateCode(parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
    }
  }
});
