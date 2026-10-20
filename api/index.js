const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 4000;

// تشخیص محیط Vercel برای استفاده از پوشه قابل نوشتن /tmp
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_FILE = IS_VERCEL
  ? path.join(os.tmpdir(), 'products.json')
  : path.join(__dirname, 'products.json');

// داده‌های اولیه مطابق با تصویر پروژه شما
const INITIAL_PRODUCTS = [
  { id: '1', title: 'Laptop', price: 1000, quantity: 1 },
  { id: '2', title: 'Mouse', price: 50, quantity: 2 },
  { id: '3', title: 'Keyboard', price: 100, quantity: 1 }
];

function initDatabase() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_PRODUCTS, null, 2), 'utf-8');
  }
}

function readProducts() {
  try {
    initDatabase();
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [...INITIAL_PRODUCTS];
  }
}

function writeProducts(products) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing database file:', err.message);
  }
}

function calculateTotalPrice(products) {
  return products.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (e) {
      return Promise.reject(new Error('Invalid JSON body'));
    }
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  try {
    if ((pathname === '/' || pathname === '/api') && method === 'GET') {
      return sendJson(res, 200, {
        message: 'Shopping Cart Zero-Dependency CRUD API is running!',
        endpoints: {
          'GET /api/products': 'دریافت لیست تمام محصولات و قیمت کل (totalPrice)',
          'GET /api/products/:id': 'دریافت اطلاعات یک محصول خاص با آیدی',
          'POST /api/products': 'افزودن محصول جدید (add product) - نیازمند title, price, quantity',
          'PUT /api/products/:id': 'ویرایش کامل یا جزئی یک محصول (title, price, quantity)',
          'PATCH /api/products/:id': 'ویرایش جزئی محصول یا تغییر تعداد (مثلا { "delta": 1 } یا { "quantity": 5 })',
          'DELETE /api/products/:id': 'حذف یک محصول خاص',
          'DELETE /api/products': 'حذف تمام محصولات سبد خرید (remove all)',
          'POST /api/products/reset': 'بازگردانی دیتابیس به مقادیر پیش‌فرض اولیه'
        }
      });
    }

    if (pathname === '/api/products' && method === 'GET') {
      const products = readProducts();
      return sendJson(res, 200, {
        success: true,
        count: products.length,
        totalPrice: calculateTotalPrice(products),
        data: products
      });
    }

    if (pathname === '/api/products/reset' && method === 'POST') {
      writeProducts(INITIAL_PRODUCTS);
      return sendJson(res, 200, {
        success: true,
        message: 'Products reset to default initial items.',
        totalPrice: calculateTotalPrice(INITIAL_PRODUCTS),
        data: INITIAL_PRODUCTS
      });
    }

    if (pathname === '/api/products' && method === 'POST') {
      const body = await parseBody(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const price = Number(body.price);
      const quantity = body.quantity !== undefined ? Number(body.quantity) : 1;

      if (!title) {
        return sendJson(res, 400, { success: false, error: 'فیلد title الزامی است.' });
      }
      if (Number.isNaN(price) || price < 0) {
        return sendJson(res, 400, { success: false, error: 'فیلد price باید یک عدد معتبر و غیرمنفی باشد.' });
      }
      if (Number.isNaN(quantity) || quantity < 1 || !Number.isInteger(quantity)) {
        return sendJson(res, 400, { success: false, error: 'فیلد quantity باید یک عدد صحیح بزرگتر یا مساوی ۱ باشد.' });
      }

      const products = readProducts();
      const newProduct = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        title,
        price,
        quantity
      };

      products.push(newProduct);
      writeProducts(products);

      return sendJson(res, 201, {
        success: true,
        message: 'Product added successfully.',
        product: newProduct,
        totalPrice: calculateTotalPrice(products),
        data: products
      });
    }

    if (pathname === '/api/products' && method === 'DELETE') {
      writeProducts([]);
      return sendJson(res, 200, {
        success: true,
        message: 'All products removed successfully.',
        totalPrice: 0,
        data: []
      });
    }

    const idMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (idMatch) {
      const productId = decodeURIComponent(idMatch[1]);
      const products = readProducts();
      const index = products.findIndex(p => String(p.id) === String(productId));

      if (index === -1) {
        return sendJson(res, 404, { success: false, error: 'محصول مورد نظر یافت نشد.' });
      }

      if (method === 'GET') {
        return sendJson(res, 200, {
          success: true,
          product: products[index]
        });
      }

      if (method === 'PUT' || method === 'PATCH') {
        const body = await parseBody(req);
        const current = products[index];

        const updatedTitle = body.title !== undefined ? String(body.title).trim() : current.title;
        const updatedPrice = body.price !== undefined ? Number(body.price) : current.price;

        let updatedQuantity = current.quantity;
        if (body.quantity !== undefined) {
          updatedQuantity = Number(body.quantity);
        } else if (body.delta !== undefined) {
          updatedQuantity = current.quantity + Number(body.delta);
        }

        if (!updatedTitle) {
          return sendJson(res, 400, { success: false, error: 'عنوان محصول نمی‌تواند خالی باشد.' });
        }
        if (Number.isNaN(updatedPrice) || updatedPrice < 0) {
          return sendJson(res, 400, { success: false, error: 'قیمت نامعتبر است.' });
        }
        if (Number.isNaN(updatedQuantity) || !Number.isInteger(updatedQuantity) || updatedQuantity < 0) {
          return sendJson(res, 400, { success: false, error: 'تعداد نامعتبر است.' });
        }

        if (updatedQuantity === 0) {
          const removed = products.splice(index, 1)[0];
          writeProducts(products);
          return sendJson(res, 200, {
            success: true,
            message: 'Product quantity reached 0 and was removed.',
            removedProduct: removed,
            totalPrice: calculateTotalPrice(products),
            data: products
          });
        }

        products[index] = {
          ...current,
          title: updatedTitle,
          price: updatedPrice,
          quantity: updatedQuantity
        };

        writeProducts(products);
        return sendJson(res, 200, {
          success: true,
          message: 'Product updated successfully.',
          product: products[index],
          totalPrice: calculateTotalPrice(products),
          data: products
        });
      }

      if (method === 'DELETE') {
        const removed = products.splice(index, 1)[0];
        writeProducts(products);
        return sendJson(res, 200, {
          success: true,
          message: 'Product deleted successfully.',
          removedProduct: removed,
          totalPrice: calculateTotalPrice(products),
          data: products
        });
      }
    }

    return sendJson(res, 404, {
      success: false,
      error: `Route ${method} ${pathname} not found.`
    });

  } catch (err) {
    return sendJson(res, 400, {
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
}

module.exports = handler;

if (require.main === module) {
  initDatabase();
  const server = http.createServer(handler);
  server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📦 API Endpoint: http://localhost:${PORT}/api/products`);
  });
}
