const https = require('https');

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
    } catch (error) {
      if (!carbonData) {
        throw error;
      }
    }
  }
  
  return carbonData;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    let data = await getCarbonData();
    let filteredData = [...data];
    
    // Country filter
    if (req.query.country) {
      const countries = req.query.country.split(',').map(c => c.trim().toLowerCase());
      filteredData = filteredData.filter(item => 
        countries.some(country => 
          item.country && item.country.toLowerCase().includes(country)
        )
      );
    }
    
    // Country code filter
    if (req.query.country_code) {
      const codes = req.query.country_code.split(',').map(c => c.trim().toUpperCase());
      filteredData = filteredData.filter(item => 
        codes.includes(item.country_code || item.code)
      );
    }
    
    // Intensity filters
    if (req.query.min_intensity) {
      const minIntensity = parseFloat(req.query.min_intensity);
      if (!isNaN(minIntensity)) {
        filteredData = filteredData.filter(item => 
          (item.carbon_intensity || item.intensity || 0) >= minIntensity
        );
      }
    }
    
    if (req.query.max_intensity) {
      const maxIntensity = parseFloat(req.query.max_intensity);
      if (!isNaN(maxIntensity)) {
        filteredData = filteredData.filter(item => 
          (item.carbon_intensity || item.intensity || 0) <= maxIntensity
        );
      }
    }
    
    // Search
    if (req.query.search) {
      const searchTerm = req.query.search.toLowerCase();
      filteredData = filteredData.filter(item => 
        item.country && item.country.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sort
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
}
