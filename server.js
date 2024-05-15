const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// Enable CORS for all requests
app.use(cors()); // Allow all origins
app.options('*', cors()); // Include preflight requests

// Serve static files from the 'public' directory
app.use(express.static('.'));

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});