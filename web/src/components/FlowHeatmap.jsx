import { useEffect, useRef, useState } from 'react';
import useContainerFit from '../hooks/useContainerFit';
import './FlowHeatmap.css';

function FlowHeatmap({ pathData, backgroundImage, loading }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [imgAspect, setImgAspect] = useState(null);
  const [transparency, setTransparency] = useState(0.7);

  const fitted = useContainerFit(containerRef, imgAspect);

  // Draw paths on the transparent canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fitted.width || !fitted.height) return;

    canvas.width = fitted.width;
    canvas.height = fitted.height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (pathData && pathData.length > 0) {
      pathData.forEach((pathEvent) => {
        if (!pathEvent.path || pathEvent.path.length === 0) return;

        const color = getColorForClass(pathEvent.class);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = transparency;

        ctx.beginPath();
        const firstPoint = pathEvent.path[0];
        const startX = (firstPoint.x / 1000) * canvas.width;
        const startY = (firstPoint.y / 1000) * canvas.height;
        ctx.moveTo(startX, startY);

        pathEvent.path.forEach((point, index) => {
          if (index === 0) return;
          const x = (point.x / 1000) * canvas.width;
          const y = (point.y / 1000) * canvas.height;
          ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.globalAlpha = 1.0;

        // Entry point (green)
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(startX, startY, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Exit point (red)
        const lastPoint = pathEvent.path[pathEvent.path.length - 1];
        const endX = (lastPoint.x / 1000) * canvas.width;
        const endY = (lastPoint.y / 1000) * canvas.height;
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(endX, endY, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, [pathData, transparency, fitted]);

  const getColorForClass = (className) => {
    const colors = {
      Car: '#FFFF00',
      Human: '#00FF00',
      Truck: '#0000FF',
      Bus: '#FFA500',
      Bike: '#FF1493',
      LicensePlate: '#00BFFF',
      Bag: '#800080',
      Head: '#FFD700',
      Animal: '#7FFF00',
      Vehicle: '#00FFFF',
      Undefined: '#A0A0A0',
      Other: '#FF0000',
    };
    return colors[className] || '#FF0000';
  };

  return (
    <div className="flow-heatmap">
      <div className="heatmap-controls">
        <div className="control-group">
          <label htmlFor="transparency-slider">
            Line Transparency: {Math.round(transparency * 100)}%
          </label>
          <input
            id="transparency-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={transparency}
            onChange={(e) => setTransparency(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="canvas-container" ref={containerRef}>
        {!backgroundImage && (
          <div className="loading">Loading camera view...</div>
        )}
        {backgroundImage && (
          <div
            className="image-overlay-wrapper"
            style={{
              width: fitted.width || '100%',
              height: fitted.height || undefined,
            }}
          >
            <img
              src={backgroundImage}
              alt="Camera view"
              className="background-img"
              style={{ height: fitted.height ? '100%' : 'auto' }}
              onLoad={(e) => setImgAspect(e.target.naturalWidth / e.target.naturalHeight)}
            />
            <canvas ref={canvasRef} className="paths-canvas" />
          </div>
        )}
      </div>
    </div>
  );
}

export default FlowHeatmap;
