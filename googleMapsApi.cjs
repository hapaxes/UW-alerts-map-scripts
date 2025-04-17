require("dotenv").config();

const apiKey = process.env.GOOGLE_MAPS_API_KEY;
// const address =
//   " NE 52nd Street and 22nd Avenue NE, university district Seattle";

async function getGeocodeFromLocation(address) {
  let data = null;
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&key=${apiKey}`
    );

    const result = await response.json();
    data = result;
  } catch (e) {
    console.log(e.message);
  } finally {
    if (data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const obj = { latitude: location.lat, longitude: location.lng };
      return obj;
    } else {
      return "N/A";
    }
  }
}

module.exports = { getGeocodeFromLocation };
