/**
 * POD (Print-on-Demand) Provider Integrations
 * Supports: Printful, Printify, Gooten, SPOD, Gelato, Prodigi
 */

// Base POD Provider class
class PODProvider {
    constructor(name, apiKey, apiUrl) {
        this.name = name;
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
    }

    async request(endpoint, options = {}) {
        const url = `${this.apiUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `${this.name} API error`);
            }

            return response.json();
        } catch (error) {
            console.error(`${this.name} API Error:`, error);
            throw error;
        }
    }

    getAuthHeaders() {
        return { 'Authorization': `Bearer ${this.apiKey}` };
    }
}

// ============================================
// PRINTFUL Integration
// https://developers.printful.com/docs/
// ============================================
export class PrintfulProvider extends PODProvider {
    constructor(apiKey) {
        super('Printful', apiKey, 'https://api.printful.com');
    }

    getAuthHeaders() {
        return { 'Authorization': `Bearer ${this.apiKey}` };
    }

    // Get available products
    async getProducts() {
        return this.request('/products');
    }

    // Get product variants
    async getProductVariants(productId) {
        return this.request(`/products/${productId}`);
    }

    // Get store products (synced)
    async getStoreProducts() {
        return this.request('/store/products');
    }

    // Create a new order
    async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify({
                recipient: {
                    name: orderData.customerName,
                    address1: orderData.address.line1,
                    address2: orderData.address.line2,
                    city: orderData.address.city,
                    state_code: orderData.address.state,
                    country_code: orderData.address.country,
                    zip: orderData.address.postalCode,
                    email: orderData.email,
                    phone: orderData.phone
                },
                items: orderData.items.map(item => ({
                    sync_variant_id: item.variantId,
                    quantity: item.quantity,
                    files: item.files
                }))
            })
        });
    }

    // Calculate shipping rates
    async calculateShipping(address, items) {
        return this.request('/shipping/rates', {
            method: 'POST',
            body: JSON.stringify({
                recipient: {
                    address1: address.line1,
                    city: address.city,
                    state_code: address.state,
                    country_code: address.country,
                    zip: address.postalCode
                },
                items: items.map(item => ({
                    variant_id: item.variantId,
                    quantity: item.quantity
                }))
            })
        });
    }

    // Get order status
    async getOrder(orderId) {
        return this.request(`/orders/${orderId}`);
    }

    // Estimate costs
    async estimateCosts(items) {
        return this.request('/orders/estimate-costs', {
            method: 'POST',
            body: JSON.stringify({ items })
        });
    }
}

// ============================================
// PRINTIFY Integration
// https://developers.printify.com/
// ============================================
export class PrintifyProvider extends PODProvider {
    constructor(apiKey, shopId) {
        super('Printify', apiKey, 'https://api.printify.com/v1');
        this.shopId = shopId;
    }

    getAuthHeaders() {
        return { 'Authorization': `Bearer ${this.apiKey}` };
    }

    // Get shop info
    async getShops() {
        return this.request('/shops.json');
    }

    // Get catalog blueprints (product types)
    async getBlueprints() {
        return this.request('/catalog/blueprints.json');
    }

    // Get print providers for a blueprint
    async getPrintProviders(blueprintId) {
        return this.request(`/catalog/blueprints/${blueprintId}/print_providers.json`);
    }

    // Get shop products
    async getProducts() {
        return this.request(`/shops/${this.shopId}/products.json`);
    }

    // Create product
    async createProduct(productData) {
        return this.request(`/shops/${this.shopId}/products.json`, {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    }

    // Create order
    async createOrder(orderData) {
        return this.request(`/shops/${this.shopId}/orders.json`, {
            method: 'POST',
            body: JSON.stringify({
                external_id: orderData.orderNumber,
                line_items: orderData.items.map(item => ({
                    product_id: item.productId,
                    variant_id: item.variantId,
                    quantity: item.quantity
                })),
                shipping_method: orderData.shippingMethod || 1,
                address_to: {
                    first_name: orderData.firstName,
                    last_name: orderData.lastName,
                    email: orderData.email,
                    phone: orderData.phone,
                    country: orderData.address.country,
                    region: orderData.address.state,
                    address1: orderData.address.line1,
                    address2: orderData.address.line2,
                    city: orderData.address.city,
                    zip: orderData.address.postalCode
                }
            })
        });
    }

    // Calculate shipping
    async calculateShipping(orderData) {
        return this.request(`/shops/${this.shopId}/orders/shipping.json`, {
            method: 'POST',
            body: JSON.stringify({
                line_items: orderData.items,
                address_to: orderData.address
            })
        });
    }

    // Get order
    async getOrder(orderId) {
        return this.request(`/shops/${this.shopId}/orders/${orderId}.json`);
    }
}

// ============================================
// GOOTEN Integration
// https://www.gooten.com/api
// ============================================
export class GootenProvider extends PODProvider {
    constructor(apiKey, recipeId) {
        super('Gooten', apiKey, 'https://api.gooten.com/api');
        this.recipeId = recipeId;
    }

    getAuthHeaders() {
        return {}; // Gooten uses query params
    }

    async request(endpoint, options = {}) {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${this.apiUrl}${endpoint}${separator}recipeid=${this.recipeId}`;
        return super.request.call({ ...this, apiUrl: '' }, url, options);
    }

    // Get products
    async getProducts() {
        return this.request('/products');
    }

    // Get product variants
    async getProductVariants(productId) {
        return this.request(`/productvariants?productId=${productId}`);
    }

    // Get shipping prices
    async getShippingPrices(orderData) {
        return this.request('/shippingprices', {
            method: 'POST',
            body: JSON.stringify({
                ShipToPostalCode: orderData.postalCode,
                ShipToCountry: orderData.country,
                ShipToState: orderData.state,
                Items: orderData.items
            })
        });
    }

    // Create order
    async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify({
                ShipToAddress: {
                    FirstName: orderData.firstName,
                    LastName: orderData.lastName,
                    Line1: orderData.address.line1,
                    Line2: orderData.address.line2,
                    City: orderData.address.city,
                    State: orderData.address.state,
                    PostalCode: orderData.address.postalCode,
                    CountryCode: orderData.address.country,
                    Email: orderData.email,
                    Phone: orderData.phone
                },
                Items: orderData.items,
                Payment: {
                    PartnerBillingKey: this.apiKey
                }
            })
        });
    }

    // Get order status
    async getOrder(orderId) {
        return this.request(`/orders/${orderId}`);
    }
}

// ============================================
// SPOD Integration
// https://spod.com/api
// ============================================
export class SPODProvider extends PODProvider {
    constructor(apiKey) {
        super('SPOD', apiKey, 'https://api.spod.com/api/v1');
    }

    getAuthHeaders() {
        return { 'X-SPOD-ACCESS-TOKEN': this.apiKey };
    }

    // Get articles (products)
    async getProducts() {
        return this.request('/articles');
    }

    // Get article details
    async getProduct(articleId) {
        return this.request(`/articles/${articleId}`);
    }

    // Create order
    async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify({
                orderReference: orderData.orderNumber,
                shipping: {
                    firstName: orderData.firstName,
                    lastName: orderData.lastName,
                    street: orderData.address.line1,
                    street2: orderData.address.line2,
                    city: orderData.address.city,
                    state: orderData.address.state,
                    zipCode: orderData.address.postalCode,
                    country: orderData.address.country,
                    email: orderData.email,
                    phone: orderData.phone
                },
                orderItems: orderData.items.map(item => ({
                    articleId: item.articleId,
                    quantity: item.quantity,
                    designs: item.designs
                }))
            })
        });
    }

    // Get shipping options
    async getShippingOptions(countryCode) {
        return this.request(`/shipping-types?countryCode=${countryCode}`);
    }

    // Get order
    async getOrder(orderId) {
        return this.request(`/orders/${orderId}`);
    }
}

// ============================================
// GELATO Integration
// https://developers.gelato.com/
// ============================================
export class GelatoProvider extends PODProvider {
    constructor(apiKey) {
        super('Gelato', apiKey, 'https://api.gelato.com/v3');
    }

    getAuthHeaders() {
        return { 'X-API-KEY': this.apiKey };
    }

    // Get catalog products
    async getProducts() {
        return this.request('/products');
    }

    // Get product details
    async getProduct(productUid) {
        return this.request(`/products/${productUid}`);
    }

    // Get price estimate
    async getPriceEstimate(items, country) {
        return this.request('/orders/quote', {
            method: 'POST',
            body: JSON.stringify({
                items,
                shippingAddress: { country }
            })
        });
    }

    // Create order
    async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify({
                orderReferenceId: orderData.orderNumber,
                customerReferenceId: orderData.customerId,
                currency: orderData.currency || 'USD',
                items: orderData.items.map(item => ({
                    itemReferenceId: item.id,
                    productUid: item.productUid,
                    quantity: item.quantity,
                    files: item.files
                })),
                shippingAddress: {
                    firstName: orderData.firstName,
                    lastName: orderData.lastName,
                    addressLine1: orderData.address.line1,
                    addressLine2: orderData.address.line2,
                    city: orderData.address.city,
                    state: orderData.address.state,
                    postCode: orderData.address.postalCode,
                    country: orderData.address.country,
                    email: orderData.email,
                    phone: orderData.phone
                }
            })
        });
    }

    // Get order
    async getOrder(orderId) {
        return this.request(`/orders/${orderId}`);
    }

    // Get shipment status
    async getShipment(orderId) {
        return this.request(`/orders/${orderId}/shipment`);
    }
}

// ============================================
// PRODIGI Integration
// https://www.prodigi.com/print-api/docs/
// ============================================
export class ProdigiProvider extends PODProvider {
    constructor(apiKey) {
        super('Prodigi', apiKey, 'https://api.prodigi.com/v4.0');
    }

    getAuthHeaders() {
        return { 'X-API-Key': this.apiKey };
    }

    // Get products
    async getProducts() {
        return this.request('/products');
    }

    // Get product details
    async getProduct(sku) {
        return this.request(`/products/${sku}`);
    }

    // Create quote
    async createQuote(orderData) {
        return this.request('/quotes', {
            method: 'POST',
            body: JSON.stringify({
                shippingMethod: orderData.shippingMethod || 'Standard',
                destinationCountryCode: orderData.address.country,
                items: orderData.items.map(item => ({
                    sku: item.sku,
                    copies: item.quantity,
                    assets: item.assets
                }))
            })
        });
    }

    // Create order
    async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify({
                idempotencyKey: orderData.orderNumber,
                merchantReference: orderData.orderNumber,
                shippingMethod: orderData.shippingMethod || 'Standard',
                recipient: {
                    name: `${orderData.firstName} ${orderData.lastName}`,
                    address: {
                        line1: orderData.address.line1,
                        line2: orderData.address.line2,
                        postalOrZipCode: orderData.address.postalCode,
                        townOrCity: orderData.address.city,
                        stateOrCounty: orderData.address.state,
                        countryCode: orderData.address.country
                    },
                    email: orderData.email,
                    phoneNumber: orderData.phone
                },
                items: orderData.items.map(item => ({
                    sku: item.sku,
                    copies: item.quantity,
                    assets: item.assets
                }))
            })
        });
    }

    // Get order
    async getOrder(orderId) {
        return this.request(`/orders/${orderId}`);
    }

    // Get order actions (cancel, etc.)
    async cancelOrder(orderId) {
        return this.request(`/orders/${orderId}/actions/cancel`, {
            method: 'POST'
        });
    }
}

// ============================================
// POD Manager - Unified Interface
// ============================================
export class PODManager {
    constructor() {
        this.providers = {};
    }

    // Register a provider
    registerProvider(name, provider) {
        this.providers[name] = provider;
    }

    // Initialize all providers from env
    initFromEnv() {
        if (process.env.PRINTFUL_API_KEY) {
            this.registerProvider('printful', new PrintfulProvider(process.env.PRINTFUL_API_KEY));
        }
        if (process.env.PRINTIFY_API_KEY && process.env.PRINTIFY_SHOP_ID) {
            this.registerProvider('printify', new PrintifyProvider(
                process.env.PRINTIFY_API_KEY,
                process.env.PRINTIFY_SHOP_ID
            ));
        }
        if (process.env.GOOTEN_API_KEY && process.env.GOOTEN_RECIPE_ID) {
            this.registerProvider('gooten', new GootenProvider(
                process.env.GOOTEN_API_KEY,
                process.env.GOOTEN_RECIPE_ID
            ));
        }
        if (process.env.SPOD_API_KEY) {
            this.registerProvider('spod', new SPODProvider(process.env.SPOD_API_KEY));
        }
        if (process.env.GELATO_API_KEY) {
            this.registerProvider('gelato', new GelatoProvider(process.env.GELATO_API_KEY));
        }
        if (process.env.PRODIGI_API_KEY) {
            this.registerProvider('prodigi', new ProdigiProvider(process.env.PRODIGI_API_KEY));
        }
    }

    // Get provider
    getProvider(name) {
        return this.providers[name];
    }

    // Get all registered providers
    getProviders() {
        return Object.keys(this.providers);
    }

    // Route order to correct provider
    async createOrder(providerName, orderData) {
        const provider = this.providers[providerName];
        if (!provider) {
            throw new Error(`Provider ${providerName} not configured`);
        }
        return provider.createOrder(orderData);
    }

    // Get shipping rates from a provider
    async getShippingRates(providerName, address, items) {
        const provider = this.providers[providerName];
        if (!provider) {
            throw new Error(`Provider ${providerName} not configured`);
        }
        return provider.calculateShipping(address, items);
    }
}

// Create singleton instance
export const podManager = new PODManager();
