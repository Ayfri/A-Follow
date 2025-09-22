import './style.css';
import p5 from 'p5';

const sketch = (p: p5) => {
	p.setup = async () => {
		p.createCanvas(p.windowWidth, p.windowHeight);
	};

	p.draw = async () => {
		p.background(220);
		p.ellipse(p.mouseX, p.mouseY, 50, 50);
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
	};
};

new p5(sketch);
