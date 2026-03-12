const socket = io();

const statusText = document.getElementById('status');
const testBtn = document.getElementById('testBtn');

socket.on('connect', () => {
  statusText.textContent = `Connected: ${socket.id}`;
  console.log('Connected to server:', socket.id);
});

testBtn.addEventListener('click', () => {
  console.log('Button clicked');
});