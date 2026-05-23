import axios from 'axios';

const BASE_URL = 'https://thesisml.onrender.com'; // update after deploy

export const getCrimeHeatmapData = async () => {
  console.log('Calling API:', `${BASE_URL}/heatmap`);
  try {
    const response = await axios.get(`${BASE_URL}/heatmap`, {
      timeout: 35000
    });
    console.log('API response status:', response.status);
    return response.data.points;
  } catch (e) {
    console.log('API error:', e.message, e.code);
    throw e;
  }
};
export const predictCrimeThreat = async (features) => {
  const response = await axios.post(`${BASE_URL}/predict`, features);
  return response.data;
};

export const getRouteOptions = async (origin, destination) => {
  const response = await axios.post(`${BASE_URL}/route`, {
    origin,
    destination
  }, { timeout: 35000 });
  return response.data;
};