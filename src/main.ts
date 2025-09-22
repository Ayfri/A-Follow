import './style.css';
import p5 from 'p5';

let xPosition = 0;
let yPosition = 0;

const sketch = (p: p5) => {
	p.setup = async () => {
		p.createCanvas(p.windowWidth, p.windowHeight);
		p.frameRate(60);
		xPosition = p.random(p.width);
		yPosition = p.random(p.height);
	};

	p.draw = async () => {
		p.background(0);
		p.ellipse(xPosition, yPosition, 50, 50);
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
	};
};

new p5(sketch);
