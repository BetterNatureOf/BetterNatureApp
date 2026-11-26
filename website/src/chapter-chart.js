import { init, use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);
export function createChart(element, selectRegion) {
  const chart = init(element, null, { renderer: 'svg' });
  chart.on('click', event => { if (event.name) selectRegion(event.name); });
  const resize = new ResizeObserver(() => chart.resize());
  resize.observe(element);
  return {
    update(rows, unit, reduced) {
      const styles = getComputedStyle(document.documentElement);
      const text = styles.getPropertyValue('--muted').trim();
      const accent = styles.getPropertyValue('--accent').trim();
      chart.setOption({
        animation: !reduced, animationDuration: 350, animationDurationUpdate: 200,
        grid: { left: 112, right: 32, top: 8, bottom: 24 },
        tooltip: { trigger: 'item', renderMode: 'richText', confine: true, valueFormatter: value => value == null ? 'Not reported' : `${value.toLocaleString('en-US')} ${unit}` },
        xAxis: { type: 'value', minInterval: 1, axisLabel: { color: text }, splitLine: { show: false } },
        yAxis: { type: 'category', inverse: true, data: rows.map(row => row.region), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: text, fontSize: 12 } },
        series: [{ type: 'bar', name: unit, data: rows.map(row => row.value), barMaxWidth: 16,
          itemStyle: { color: accent, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: text, formatter: p => p.value == null ? '' : String(p.value) } }],
      }, { notMerge: true });
    },
    dispose() { resize.disconnect(); chart.dispose(); },
  };
}
