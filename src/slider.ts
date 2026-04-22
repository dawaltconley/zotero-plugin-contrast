export function createSliderGroup(
  doc: Document,
  dataAttr: string,
): HTMLDivElement {
  const group = doc.createElement('div');
  group.className = 'group';
  group.setAttribute(`data-${dataAttr}`, '');
  return group;
}

export interface SliderConfig {
  min: number;
  max: number;
  step: number;
  label: string;
  dataAttr: string;
  inputId: string;
}

export function createSlider(
  doc: Document,
  initialValue: number,
  callback: (value: number) => void,
  config: SliderConfig,
): HTMLDivElement {
  const steps = (config.max - config.min) / config.step;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => {
    const pct = (i / steps) * 100;
    return `${pct.toFixed(2)}%`;
  });

  const row = doc.createElement('div');
  row.className = 'row';

  const label = doc.createElement('label');
  label.setAttribute('for', config.inputId);
  label.textContent = config.label;

  const tickedRange = doc.createElement('div');
  tickedRange.className = 'ticked-range-input';

  const tickBar = doc.createElement('div');
  tickBar.className = 'tick-bar';
  for (const position of ticks) {
    const tick = doc.createElement('div');
    tick.className = 'tick';
    tick.style.setProperty('--position', position);
    tickBar.appendChild(tick);
  }

  const input = doc.createElement('input');
  input.type = 'range';
  input.id = config.inputId;
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.value = String(initialValue);
  input.setAttribute('data-tabstop', '1');
  input.setAttribute('tabindex', '-1');
  input.style.cssText = 'position: relative; width: 100%;';

  tickedRange.appendChild(tickBar);
  tickedRange.appendChild(input);

  const valueSpan = doc.createElement('span');
  valueSpan.className = 'value';
  valueSpan.textContent = `${initialValue}%`;

  input.addEventListener('input', () => {
    const value = Number(input.value);
    valueSpan.textContent = `${value}%`;
    callback(value);
  });

  row.appendChild(label);
  row.appendChild(tickedRange);
  row.appendChild(valueSpan);
  return row;
}
