import express from 'express';
import os from 'os';

const app = express();
const PORT = 3000;

// Serve main HTML page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recipe Explorer | Food API Test</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  <style>
    .recipe-card {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .recipe-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 25px -12px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body class="bg-gradient-to-br from-orange-50 to-amber-50 text-gray-800 font-sans">

  <!-- Navigation -->
  <nav class="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-amber-200 shadow-sm">
    <div class="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
      <span class="text-2xl font-black tracking-tighter text-amber-600">🍲 RECIPE<span class="text-gray-800">EXPLORER</span></span>
      <div class="hidden md:flex gap-8 text-sm font-medium text-gray-600">
        <a href="#about" class="hover:text-amber-600 transition">About</a>
        <a href="#gallery" class="hover:text-amber-600 transition">Gallery</a>
        <a href="#recipe-api" class="hover:text-amber-600 transition">Recipe API</a>
      </div>
      <div class="flex items-center gap-2 bg-amber-100 px-3 py-1 rounded-full border border-amber-300">
        <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        <span class="text-[10px] font-bold text-amber-800 uppercase">Live API Ready</span>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <header class="relative py-24 px-6 text-center overflow-hidden">
    <div class="max-w-4xl mx-auto relative z-10">
      <h1 class="text-5xl md:text-7xl font-black text-gray-900 mb-6 tracking-tight">
        Discover <span class="text-amber-600">Delicious</span> Recipes
      </h1>
      <p class="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
        Powered by TheMealDB – test your API integration with random global dishes.  
        Click the button below and see real recipe data rendered beautifully.
      </p>
      <div class="flex flex-col md:flex-row justify-center gap-4">
        <button id="getRecipeBtn" class="bg-amber-600 hover:bg-amber-700 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-amber-500/30 transition-all active:scale-95">
          <i class="fas fa-utensils mr-2"></i> Get Random Recipe
        </button>
      </div>
    </div>
  </header>

  <!-- About Section -->
  <section id="about" class="py-20 px-6 max-w-6xl mx-auto">
    <div class="grid md:grid-cols-2 gap-12 items-center">
      <div class="bg-amber-600 rounded-3xl p-10 text-white shadow-2xl">
        <h2 class="text-3xl font-bold mb-4">Why This Test?</h2>
        <p class="opacity-90 mb-6 leading-relaxed">
          This app serves as a frontend playground for testing external API calls, rendering dynamic JSON data, and building responsive UI components.
        </p>
        <div class="space-y-4">
          <div class="flex justify-between border-b border-white/20 pb-2">
            <span>Environment</span>
            <span class="font-mono">${os.platform()} (${os.arch()})</span>
          </div>
          <div class="flex justify-between border-b border-white/20 pb-2">
            <span>Node Version</span>
            <span class="font-mono">${process.version}</span>
          </div>
          <div class="flex justify-between border-b border-white/20 pb-2">
            <span>Memory Usage</span>
            <span class="font-mono">${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        </div>
      </div>
      <div>
        <h3 class="text-2xl font-bold mb-4 italic text-amber-600">"Good food is the foundation of genuine happiness."</h3>
        <p class="text-gray-600">Every click fetches a real recipe from an open API – testing your network, JSON parsing, and dynamic rendering skills.</p>
      </div>
    </div>
  </section>

  <!-- Gallery Section (Food images) -->
  <section id="gallery" class="py-20 px-6 bg-gray-900 text-white">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl font-bold mb-10 text-center">🍽️ Visual Inspiration</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <img src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Burger">
        <img src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Salad">
        <img src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Pizza">
        <img src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop" class="rounded-xl hover:scale-105 transition duration-500 shadow-xl" alt="Sushi">
      </div>
    </div>
  </section>

  <!-- Recipe API Section -->
  <section id="recipe-api" class="py-20 px-6 max-w-4xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-4xl font-bold text-gray-800 mb-4">🍳 Live Recipe API</h2>
      <p class="text-gray-600">Click the button – a random meal appears with ingredients and instructions.</p>
    </div>

    <div id="recipeResult" class="hidden">
      <!-- Dynamic recipe card will be inserted here -->
    </div>

    <div id="loadingSpinner" class="hidden text-center py-12">
      <i class="fas fa-spinner fa-spin text-4xl text-amber-600"></i>
      <p class="mt-4 text-gray-500">Fetching a tasty recipe...</p>
    </div>

    <div id="errorMessage" class="hidden bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-xl text-center">
      <i class="fas fa-exclamation-triangle mr-2"></i> Oops! Could not fetch recipe. Please try again.
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-10 border-t border-amber-200 text-center text-gray-500 text-sm bg-white/50">
    <p>🍴 Recipe Explorer | Powered by TheMealDB.com</p>
    <p class="mt-2 font-mono text-[10px]">Test App – API Integration Demo | Node.js + Express</p>
  </footer>

  <script>
    const getRecipeBtn = document.getElementById('getRecipeBtn');
    const recipeResult = document.getElementById('recipeResult');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorMessage = document.getElementById('errorMessage');

    // Helper to format ingredients list from TheMealDB response
    function formatIngredients(meal) {
      let ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const ingredient = meal[\`strIngredient\${i}\`];
        const measure = meal[\`strMeasure\${i}\`];
        if (ingredient && ingredient.trim() !== "") {
          ingredients.push(\`<li class="flex items-start gap-2"><span class="text-amber-600 font-bold">•</span> <span>\${measure ? measure : ''} \${ingredient}</span></li>\`);
        }
      }
      return ingredients.join('');
    }

    async function fetchRandomRecipe() {
      // Reset UI
      recipeResult.classList.add('hidden');
      errorMessage.classList.add('hidden');
      loadingSpinner.classList.remove('hidden');
      getRecipeBtn.disabled = true;
      getRecipeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Loading...';

      try {
        const response = await fetch('https://www.themealdb.com/api/json/v1/1/random.php');
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        const meal = data.meals[0];

        if (!meal) throw new Error('No recipe found');

        // Build the recipe card
        const ingredientsList = formatIngredients(meal);

        const recipeHTML = \`
          <div class="recipe-card bg-white rounded-3xl shadow-xl overflow-hidden border border-amber-100">
            <div class="md:flex">
              <div class="md:w-1/2">
                <img src="\${meal.strMealThumb}" alt="\${meal.strMeal}" class="w-full h-full object-cover">
              </div>
              <div class="p-6 md:w-1/2">
                <h3 class="text-3xl font-bold text-gray-800 mb-2">\${meal.strMeal}</h3>
                <p class="text-amber-600 mb-4"><i class="fas fa-globe mr-2"></i> \${meal.strArea || 'International'} Cuisine</p>
                <div class="mb-4">
                  <h4 class="text-xl font-semibold mb-2">🛒 Ingredients</h4>
                  <ul class="space-y-1 text-gray-700 text-sm">\${ingredientsList}</ul>
                </div>
                <div>
                  <h4 class="text-xl font-semibold mb-2">📖 Instructions</h4>
                  <p class="text-gray-600 text-sm leading-relaxed max-h-40 overflow-y-auto pr-2">\${meal.strInstructions.substring(0, 500)}...</p>
                </div>
                <div class="mt-4 pt-3 border-t border-gray-100">
                  <a href="\${meal.strSource}" target="_blank" class="text-amber-600 hover:underline text-sm"><i class="fas fa-external-link-alt mr-1"></i> View original recipe</a>
                </div>
              </div>
            </div>
          </div>
        \`;

        recipeResult.innerHTML = recipeHTML;
        recipeResult.classList.remove('hidden');
      } catch (err) {
        console.error(err);
        errorMessage.classList.remove('hidden');
      } finally {
        loadingSpinner.classList.add('hidden');
        getRecipeBtn.disabled = false;
        getRecipeBtn.innerHTML = '<i class="fas fa-utensils mr-2"></i> Get Random Recipe';
      }
    }

    getRecipeBtn.addEventListener('click', fetchRandomRecipe);
  </script>
</body>
</html>
  `);
});

// Optional: simple API endpoint to test server status
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`🍕 Recipe Explorer running at http://localhost:${PORT}`);
});