
import React from 'react';

interface PieChartProps {
  data: {
    name: string;
    value: number;
    color: string;
  }[];
}

const PieChart: React.FC<PieChartProps> = ({ data }) => {
  const total = data.reduce((acc, item) => acc + item.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center w-48 h-48 bg-slate-800 rounded-full">
        <p className="text-slate-400 text-sm">Veri Yok</p>
      </div>
    );
  }

  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  const slices = data.map(item => {
    const percent = item.value / total;
    const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
    cumulativePercent += percent;
    const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
    const largeArcFlag = percent > 0.5 ? 1 : 0;
    const pathData = [
      `M ${startX} ${startY}`,
      `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      `L 0 0`,
    ].join(' ');

    return { path: pathData, color: item.color };
  });

  return (
    <div className="flex flex-col items-center">
      <div className="w-48 h-48">
        <svg viewBox="-1 -1 2 2" style={{ transform: 'rotate(-90deg)' }}>
          {slices.map((slice, index) => (
            <path key={index} d={slice.path} fill={slice.color} />
          ))}
        </svg>
      </div>
      <div className="mt-4 w-full flex flex-col items-start gap-2">
        {data.map(item => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
            return (
                <div key={item.name} className="flex items-center text-sm w-full">
                    <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                    <span className="text-slate-300">{item.name}</span>
                    <span className="ml-auto font-medium text-white">{percentage}%</span>
                </div>
            )
        })}
      </div>
    </div>
  );
};

export default PieChart;