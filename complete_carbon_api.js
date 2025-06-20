const express = require('express');
const https = require('https');
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Cache for the data
let carbonData = null;
let lastFetched = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Function to fetch data from your GitHub Gist
function fetchCarbonData() {
  return new Promise((resolve, reject) => {
    const url = 'https://gist.githubusercontent.com/RealDranyX/1bcdfa351198416fc42cce9fe7caa0da/raw/a011c26334ecfe53b2cdd6e1b1d2adea3d905492/carbon_intensity.json';
    
    https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Function to get cached or fresh data
async function getCarbonData() {
  const now = Date.now();
  
  if (!carbonData || !lastFetched || (now - lastFetched) > CACHE_DURATION) {
    try {
      carbonData = await fetchCarbonData();
      lastFetched = now;
      console.log('Data refreshed from source');
    } catch (error) {
      console.error('Error fetching data:', error);
      if (!carbonData) {
        throw error;
      }
      // Use cached data if fetch fails
    }
  }
  
  return carbonData;
}

// Main API endpoint
app.get('/api/carbon-intensity', async (req, res) => {
  try {
    let data = await getCarbonData();
    let filteredData = [...data];
    
    // Country filter (supports multiple countries separated by comma)
    if (req.query.country) {
      const countries = req.query.country.split(',').map(c => c.trim().toLowerCase());
      filteredData = filteredData.filter(item => 
        countries.some(country => 
          item.country && item.country.toLowerCase().includes(country)
        )
      );
    }
    
    // Country code filter (ISO codes)
    if (req.query.country_code) {
      const codes = req.query.country_code.split(',').map(c => c.trim().toUpperCase());
      filteredData = filteredData.filter(item => 
        codes.includes(item.country_code || item.code)
      );
    }
    
    // Minimum carbon intensity filter
    if (req.query.min_intensity) {
      const minIntensity = parseFloat(req.query.min_intensity);
      if (!isNaN(minIntensity)) {
        filteredData = filteredData.filter(item => 
          (item.carbon_intensity || item.intensity || 0) >= minIntensity
        );
      }
    }
    
    // Maximum carbon intensity filter
    if (req.query.max_intensity) {
      const maxIntensity = parseFloat(req.query.max_intensity);
      if (!isNaN(maxIntensity)) {
        filteredData = filteredData.filter(item => 
          (item.carbon_intensity || item.intensity || 0) <= maxIntensity
        );
      }
    }
    
    // Search in country names
    if (req.query.search) {
      const searchTerm = req.query.search.toLowerCase();
      filteredData = filteredData.filter(item => 
        item.country && item.country.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sort options
    if (req.query.sort) {
      const sortField = req.query.sort;
      const sortOrder = req.query.order === 'desc' ? -1 : 1;
      
      filteredData.sort((a, b) => {
        let aVal = a[sortField] || a.carbon_intensity || a.intensity || 0;
        let bVal = b[sortField] || b.carbon_intensity || b.intensity || 0;
        
        if (typeof aVal === 'string') {
          return aVal.localeCompare(bVal) * sortOrder;
        }
        return (aVal - bVal) * sortOrder;
      });
    }
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || filteredData.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    const paginatedData = filteredData.slice(startIndex, endIndex);
    
    // Response
    res.json({
      success: true,
      total: filteredData.length,
      page: page,
      limit: limit,
      pages: Math.ceil(filteredData.length / limit),
      filters_applied: {
        country: req.query.country || null,
        country_code: req.query.country_code || null,
        min_intensity: req.query.min_intensity || null,
        max_intensity: req.query.max_intensity || null,
        search: req.query.search || null,
        sort: req.query.sort || null,
        order: req.query.order || 'asc'
      },
      data: paginatedData
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch carbon intensity data',
      message: error.message
    });
  }
});

// Get all available countries
app.get('/api/countries', async (req, res) => {
  try {
    const data = await getCarbonData();
    const countries = [...new Set(data.map(item => item.country).filter(Boolean))].sort();
    
    res.json({
      success: true,
      total: countries.length,
      countries: countries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch countries',
      message: error.message
    });
  }
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Carbon Intensity API',
    version: '1.0.0',
    description: 'API for filtering carbon intensity data by country and other parameters',
    endpoints: {
      '/api/carbon-intensity': {
        method: 'GET',
        description: 'Get carbon intensity data with optional filters',
        parameters: {
          country: 'Filter by country name (supports comma-separated values)',
          country_code: 'Filter by country code (supports comma-separated values)',
          min_intensity: 'Minimum carbon intensity value',
          max_intensity: 'Maximum carbon intensity value',
          search: 'Search in country names',
          sort: 'Sort by field (country, carbon_intensity, etc.)',
          order: 'Sort order: asc or desc (default: asc)',
          page: 'Page number for pagination (default: 1)',
          limit: 'Number of results per page'
        },
        examples: [
          '/api/carbon-intensity?country=Germany',
          '/api/carbon-intensity?country=United States,Canada',
          '/api/carbon-intensity?min_intensity=200&max_intensity=500',
          '/api/carbon-intensity?search=united&sort=carbon_intensity&order=desc',
          '/api/carbon-intensity?page=1&limit=10'
        ]
      },
      '/api/countries': {
        method: 'GET',
        description: 'Get list of all available countries'
      }
    }
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const data = await getCarbonData();
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      total_records: data.length,
      last_updated: new Date(lastFetched).toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Carbon Intensity API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health',
    endpoints: {
      carbon_data: '/api/carbon-intensity',
      countries: '/api/countries'
    },
    example_usage: [
      `${req.protocol}://${req.get('host')}/api/carbon-intensity?country=Germany`,
      `${req.protocol}://${req.get('host')}/api/carbon-intensity?min_intensity=100&limit=5`,
      `${req.protocol}://${req.get('host')}/api/countries`
    ]
  });
});

app.listen(port, () => {
  console.log(`🚀 Carbon Intensity API running on port ${port}`);
  console.log(`📖 Documentation: http://localhost:${port}/api/docs`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
  console.log('\n📝 Example requests:');
  console.log(`   http://localhost:${port}/api/carbon-intensity?country=Germany`);
  console.log(`   http://localhost:${port}/api/carbon-intensity?country=United States,Canada`);
  console.log(`   http://localhost:${port}/api/carbon-intensity?min_intensity=200&sort=carbon_intensity`);
  console.log(`   http://localhost:${port}/api/countries`);
});