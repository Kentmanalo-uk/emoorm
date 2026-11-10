# E-COMMERCE MACHINE LEARNING INTEGRATION BLUEPRINT
## Hostinger-Only | Self-Hosted | Production-Oriented Implementation

**Project:** Existing E-Commerce Application
**Module:** Machine Learning & Intelligence System
**Deployment:** Existing Hostinger Hosting Environment
**Architecture:** Integrated, Modular, Self-Hosted ML Engine
**External ML Services:** Not permitted
**External AI APIs:** Not permitted
**Primary Objective:** Integrate intelligent ML capabilities without breaking, replacing, or rebuilding the existing application.

---

# 1. PROJECT OBJECTIVE

Transform the existing e-commerce application into an intelligent marketplace by integrating a collection of Machine Learning models directly into its existing hosting environment.

The system must operate entirely within the existing Hostinger hosting infrastructure.

The ML engine must use the application's existing backend, database, server resources, and available execution capabilities.

The implementation must NOT require:

- A separate ML server.
- A separate VPS.
- A separately deployed FastAPI service.
- An external AI API.
- OpenAI API.
- Gemini API.
- Claude API.
- Hugging Face hosted inference.
- External model inference platforms.
- Paid third-party ML services.
- Another cloud provider.
- A separate hosting subscription.

All ML algorithms must execute within the existing application's hosting environment, subject to its actual technical capabilities.

The system must be modular, lightweight, resource-efficient, secure, and compatible with the existing application architecture.

**The existing application and its hosting environment are the foundation. Machine Learning is an additional internal capability.**

---

# 2. ABSOLUTE IMPLEMENTATION REQUIREMENTS

These requirements take priority over every other implementation decision.

## 2.1 Preserve the Existing Application

Before modifying the application:

1. Inspect the entire repository.
2. Identify the frontend framework and version.
3. Identify the backend framework and version.
4. Identify the database engine and version.
5. Identify the current hosting environment.
6. Identify available server-side execution capabilities.
7. Identify existing authentication and authorization.
8. Identify existing API routes.
9. Inspect the existing database schema.
10. Identify existing queues, schedulers, and background-processing mechanisms.
11. Inspect existing deployment configurations.
12. Identify reusable services and components.

Do not assume the application uses Laravel, PHP, Next.js, Node.js, or another particular framework.

Use the actual technologies already present.

Do not replace the current backend simply to accommodate an ML library.

## 2.2 Zero-Breaking-Change Policy

All existing features must remain functional.

Preserve:

- Customer authentication.
- Seller authentication.
- Administrator authentication.
- Product management.
- Product categories.
- Shopping cart.
- Checkout.
- Payment processing.
- Order management.
- Order tracking.
- Inventory management.
- Product reviews.
- Seller dashboards.
- Customer dashboards.
- Administrator dashboards.
- Notifications.
- Search and filtering.
- Existing APIs.
- Existing integrations.
- Existing permissions.

Never replace working business logic with model-generated predictions.

Never allow ML failures to prevent ordinary e-commerce operations.

## 2.3 No Destructive Database Changes

- Never drop existing tables.
- Never delete existing customer records.
- Never reset the database.
- Never replace production records with sample data.
- Never remove existing relationships.
- Never rename existing columns without explicit approval.
- Use additive migrations.
- Create indexes where necessary.
- Document migration rollback procedures.
- Preserve existing database conventions.

The existing database remains the primary source of truth.

## 2.4 No Fake Data

Never fabricate:

- Customer purchase history.
- Product sales.
- Inventory levels.
- Customer reviews.
- Product ratings.
- Recommendation performance.
- Forecast results.
- Fraud statistics.
- Customer segments.

All predictions must be based on actual application data.

When historical information is insufficient, display a clear insufficient-data state.

Do not display fabricated ML predictions to make the dashboard appear functional.

---

# 3. HOSTINGER-ONLY ARCHITECTURE

## 3.1 Core Architecture

The entire system must run within the existing Hostinger hosting environment.

Use the existing application backend as the execution environment for ML algorithms.

The ML engine must be implemented as an internal module rather than a separately deployed service.

Conceptual architecture:

    EXISTING HOSTINGER HOSTING
    |
    |-- Existing E-Commerce Frontend
    |
    |-- Existing Backend
    |   |
    |   |-- Authentication
    |   |-- Products
    |   |-- Orders
    |   |-- Payments
    |   |-- Inventory
    |   |-- Reviews
    |   |
    |   |-- INTERNAL ML ENGINE
    |       |
    |       |-- Recommendation Engine
    |       |-- Demand Forecasting
    |       |-- Semantic Search
    |       |-- Customer Segmentation
    |       |-- Purchase Prediction
    |       |-- Inventory Prediction
    |       |-- Sentiment Analysis
    |       |-- Fraud Detection
    |       |-- Product Bundling
    |       |-- Image Analysis
    |
    |-- Existing Database
    |   |
    |   |-- Existing Business Tables
    |   |-- ML Events
    |   |-- ML Predictions
    |   |-- Model Metadata
    |   |-- ML Alerts
    |
    |-- Existing Scheduler / Queue
        |
        |-- Scheduled Model Updates
        |-- Data Processing
        |-- Prediction Generation
        |-- Model Evaluation

All components must remain within the available hosting resources.

## 3.2 No Separate ML Microservice

Do not create an independently deployed ML server.

Do not require a permanent FastAPI server.

Do not require another Node.js or Python application running on another server.

Instead, implement internal ML modules that can be called directly by the existing backend.

Example conceptual structure:

    application/
    |
    |-- existing application files
    |
    |-- internal ML module
        |
        |-- Core
        |-- Recommendations
        |-- Forecasting
        |-- Search
        |-- CustomerAnalytics
        |-- Inventory
        |-- Sentiment
        |-- FraudDetection
        |-- Bundling
        |-- ImageAnalysis
        |-- Training
        |-- Evaluation
        |-- Storage
        |-- Configuration

Adapt the actual folder structure to the existing repository.

Do not blindly create this exact structure if it conflicts with established architecture.

## 3.3 Backend Compatibility

Select the implementation based on the existing backend.

### If the application uses Laravel / PHP

Prefer:

- Native PHP for lightweight algorithms.
- Existing Laravel services and dependency injection.
- Laravel Scheduler for scheduled ML tasks.
- Laravel Queues when supported.
- Existing database connections.
- Existing authentication and authorization.
- PHP-compatible ML libraries only when genuinely necessary.

Possible library:

- PHP-ML for selected traditional ML algorithms.

Implement lightweight algorithms directly when doing so is simpler, more efficient, and easier to maintain.

### If the application uses Next.js / Node.js

Prefer:

- Existing Node.js runtime.
- TypeScript or JavaScript for lightweight algorithms.
- Existing backend services and API routes.
- Existing database connections.
- Existing scheduled execution mechanisms.
- Existing queue infrastructure, if available.

Possible libraries:

- ml.js.
- TensorFlow.js Node bindings, only if compatible with the actual hosting environment.
- Natural, for lightweight NLP tasks.
- Existing JavaScript numerical libraries.

Do not introduce native dependencies that cannot run on the hosting environment.

### If the application uses another backend

Use its existing runtime and compatible libraries.

Do not migrate the backend just to accommodate Machine Learning.

## 3.4 Hosting Capability Inspection

Before implementing the ML engine, determine:

- Available PHP version.
- Available Node.js version.
- Available Python version, if any.
- Available RAM.
- CPU limitations.
- Disk capacity.
- Database limits.
- Maximum execution time.
- Background process restrictions.
- Cron job availability.
- Queue worker availability.
- SSH access.
- Package installation permissions.
- Persistent process restrictions.
- Native dependency compatibility.

Do not assume that Hostinger shared hosting has VPS-level capabilities.

If Python is unavailable, use the existing backend runtime.

If persistent workers are unavailable, use supported scheduled jobs or bounded processing.

If a library requires unavailable native dependencies, select a compatible alternative.

Do not recommend upgrading hosting unless the existing hosting environment demonstrably cannot support the required feature.

---

# 4. MACHINE LEARNING MODULES

Implement the following ten modules.

Prioritize lightweight, practical algorithms that can execute using limited CPU and memory.

# MODULE 01 — PERSONALIZED PRODUCT RECOMMENDATION

**Priority:** Critical
**Category:** Recommendation Systems

## Objective

Recommend products based on customer interests, interactions, purchasing behavior, and product similarities.

## Features

### Personalized Recommendations

Analyze:

- Previously purchased products.
- Product views.
- Search interactions.
- Add-to-cart events.
- Product categories.
- Ratings.
- Purchase frequency.

### Similar Products

Recommend products with similar:

- Names.
- Categories.
- Descriptions.
- Tags.
- Attributes.
- Price ranges.

### Frequently Bought Together

Discover product combinations from completed transactions.

### Trending Products

Identify products with increasing engagement and actual sales.

### Cold-Start Recommendations

For new customers, use product similarity, actual popularity, and relevant contextual information.

Do not invent personal preferences when no behavioral history exists.

## Recommended Algorithms

Start with lightweight algorithms:

1. Content-Based Filtering.
2. TF-IDF.
3. Cosine Similarity.
4. Item-Based Collaborative Filtering.
5. Popularity-Based Ranking.
6. Hybrid Recommendation.

Only introduce more computationally expensive algorithms when the available data and hosting resources justify them.

## Data Requirements

Collect:

- product_viewed
- product_searched
- product_added_to_cart
- product_removed_from_cart
- product_purchased
- product_reviewed
- product_favorited

Use actual customer interactions.

## Integration

Display recommendations in:

- Customer homepage.
- Product details.
- Related products.
- Shopping cart.

Cache recommendations to avoid recalculating them on every page request.

---

# MODULE 02 — PRODUCT DEMAND FORECASTING

**Priority:** Critical
**Category:** Predictive Analytics

## Objective

Predict future product demand using historical sales.

Help sellers understand which products may experience increasing or decreasing demand.

## Forecasting Periods

- Next 7 days.
- Next 30 days.
- Next 90 days, if sufficient data exists.

## Input Variables

- Historical units sold.
- Historical revenue.
- Product price.
- Promotions.
- Day of the week.
- Month.
- Seasonal patterns.
- Stock availability.
- Historical sales trends.

## Recommended Algorithms

Prioritize:

1. Moving Average.
2. Weighted Moving Average.
3. Exponential Smoothing.
4. Linear Regression.
5. Lightweight Regression Models.

Consider Random Forest or XGBoost only if the hosting environment can support them efficiently.

Avoid large LSTM or deep-learning models on resource-constrained shared hosting.

## Seller Dashboard

Display:

- Historical sales.
- Predicted demand.
- Forecast period.
- Sales trends.
- Prediction uncertainty.
- Recommended preparation quantity.

Never fabricate forecasts.

When insufficient historical sales exist, show a clear explanation.

## Evaluation

Use:

- MAE.
- RMSE.
- MAPE where appropriate.
- Time-based validation.

Compare against simple forecasting baselines.

---

# MODULE 03 — INTELLIGENT SEMANTIC PRODUCT SEARCH

**Priority:** High
**Category:** Natural Language Processing

## Objective

Improve product discovery by understanding the meaning behind search queries.

## Example Searches

- Local snacks from Mindoro.
- Affordable pasalubong.
- Sweet products made from mango.
- Local food gifts.
- Products suitable for souvenirs.

## Hostinger-Compatible Implementation

Start with:

- Text preprocessing.
- Tokenization.
- TF-IDF.
- Cosine Similarity.
- Keyword expansion.
- Product attribute matching.

Use the existing database as the product source.

Do not initially require large language models or hosted embedding services.

## Functional Requirements

Search must preserve:

- Product category filters.
- Price filters.
- Product availability.
- Seller location restrictions.
- Product sorting.
- Existing search behavior.

Use the existing search mechanism as a fallback.

If lightweight semantic matching does not return sufficiently relevant results, fall back to normal keyword search.

## Performance

- Precompute product text features.
- Cache reusable search data.
- Update product indexes when listings change.
- Avoid processing the entire catalog on every search request.

---

# MODULE 04 — CUSTOMER SEGMENTATION

**Priority:** High
**Category:** Unsupervised Learning

## Objective

Identify customer groups using purchasing patterns.

## Segmentation Categories

- Frequent Buyers.
- High-Value Buyers.
- Occasional Buyers.
- New Customers.
- Returning Customers.
- Inactive Customers.

## Recommended Algorithm

Start with RFM Analysis:

- Recency.
- Frequency.
- Monetary Value.

Implement K-Means only if sufficient data and compatible libraries are available.

A deterministic RFM-based segmentation fallback must remain available.

## Dashboard

Display:

- Segment distribution.
- Returning customer trends.
- Purchase frequency.
- Average spending.
- Customer retention.

## Privacy

Use aggregated statistics.

Seller analytics must only contain information the seller is authorized to access.

---

# MODULE 05 — CUSTOMER PURCHASE PREDICTION

**Priority:** Medium
**Category:** Supervised Learning

## Objective

Estimate the likelihood of a customer purchasing a particular product within a defined period.

## Features

Consider:

- Product views.
- Cart interactions.
- Purchase history.
- Product category interests.
- Previous conversions.
- Price preferences.

## Recommended Algorithms

- Logistic Regression.
- Naive Bayes where appropriate.
- Lightweight Decision Trees.

Do not introduce unnecessarily large models.

## Requirements

Return:

- Purchase probability.
- Prediction window.
- Model version.
- Prediction timestamp.

Evaluate prediction quality against actual outcomes.

Do not use predictions to manipulate customer prices or automatically send excessive marketing notifications.

---

# MODULE 06 — INVENTORY PREDICTION

**Priority:** Critical
**Category:** Predictive Analytics

## Objective

Predict potential stock shortages using current inventory and historical sales.

## Required Information

- Current stock.
- Historical sales.
- Average daily sales.
- Pending orders.
- Reserved stock.
- Supplier lead time, if available.
- Predicted demand.

## Functional Requirements

Calculate:

- Estimated days until stockout.
- Potential stockout date.
- Inventory risk level.
- Suggested restocking quantity.

## Example

Product: Mango Jam.

Available stock: 40 units.

Recent average daily sales: 5 units.

Estimated stock depletion: 8 days, assuming the current sales rate remains stable.

This calculation is deterministic.

For improved forecasting, combine it with the demand forecasting model.

## Alerts

- Low stock.
- Potential stockout.
- Increasing demand.
- Suggested restocking.

Never allow the prediction engine to directly change actual inventory.

---

# MODULE 07 — REVIEW SENTIMENT ANALYSIS

**Priority:** High
**Category:** Natural Language Processing

## Objective

Analyze customer feedback and identify common positive and negative product attributes.

## Example

Review:

"The banana chips taste great, but the packaging arrived damaged."

Analysis:

- Taste: Positive.
- Packaging: Negative.
- Overall sentiment: Mixed.

## Hostinger-Compatible Approach

Start with:

- Text preprocessing.
- Sentiment lexicons.
- Lightweight classification.
- Naive Bayes.
- TF-IDF-based classification.

Use pretrained local models only if they can be downloaded, stored, and executed within the available hosting resources and licensing permits their use.

Do not depend on hosted Hugging Face inference.

## Requirements

Support, where practical:

- English.
- Filipino.
- Mixed-language reviews.

Do not assume English-only sentiment models accurately understand Filipino.

## Dashboard

Show:

- Positive feedback.
- Negative feedback.
- Neutral feedback.
- Common complaints.
- Review trends.

Do not automatically delete reviews or change product ratings.

---

# MODULE 08 — FRAUD AND ANOMALY DETECTION

**Priority:** High
**Category:** Anomaly Detection

## Objective

Identify potentially suspicious transaction and account behavior.

## Detectable Patterns

- Unusual purchase frequency.
- Repeated failed payment attempts.
- Unusual transaction values.
- Abnormal order patterns.
- Suspicious account activity.

## Recommended Algorithms

Start with:

- Statistical anomaly detection.
- Threshold-based detection.
- Isolation Forest only if a compatible lightweight implementation is practical.
- Logistic Regression when properly labeled training data exists.

Do not require large neural networks.

## Administrator Dashboard

Display:

- Flagged transaction.
- Associated order.
- Risk score.
- Detection reason.
- Timestamp.
- Review status.

Possible statuses:

- Pending Review.
- Confirmed Suspicious.
- Cleared.
- Escalated.

An ML risk score is not proof of fraud.

Never automatically suspend customers, cancel legitimate orders, or block payments based solely on predictions.

Existing payment validation remains authoritative.

---

# MODULE 09 — SMART PRODUCT BUNDLING

**Priority:** Medium
**Category:** Association Rule Mining

## Objective

Discover products that customers frequently purchase together.

## Recommended Algorithms

- Apriori.
- FP-Growth.
- Association Rule Mining.

For small datasets, prefer an efficient implementation appropriate to the available resources.

## Functional Requirements

Calculate:

- Support.
- Confidence.
- Lift.

Use completed transaction records.

Generate bundle suggestions for sellers.

Require seller approval before publishing promotional bundles.

---

# MODULE 10 — PRODUCT IMAGE CLASSIFICATION AND QUALITY ANALYSIS

**Priority:** Medium
**Category:** Computer Vision

## Objective

Help sellers upload clearer, more relevant product images.

## Image Quality Analysis

Prioritize lightweight image-processing operations:

- Image resolution.
- Blur detection.
- Brightness.
- Contrast.
- Image dimensions.
- File size.
- Basic image visibility.

Use compatible image-processing libraries only when supported by the hosting environment.

## Classification

Optional category classification can use a small locally stored model if:

- The hosting environment supports model execution.
- Memory requirements are acceptable.
- Inference latency is reasonable.
- Model licensing permits deployment.

Do not require large computer-vision models.

## Important Limitations

Image analysis cannot establish product authenticity, food safety, or regulatory compliance.

Provide seller correction options and administrator review.

---

# 5. CENTRALIZED ML EVENT COLLECTION

Create an internal event collection system.

Use existing backend event mechanisms wherever possible.

## Required Events

| Event | Description |
|---|---|
| product_viewed | Customer views a product |
| product_searched | Customer searches |
| product_clicked | Customer opens a product |
| product_added_to_cart | Product added to cart |
| product_removed_from_cart | Product removed |
| product_purchased | Completed purchase |
| product_reviewed | Review submitted |
| product_favorited | Product saved |
| order_completed | Order reaches completed status |
| product_stock_updated | Seller updates stock |

## Event Structure

Each event should contain:

- Unique identifier.
- Event type.
- Relevant entity ID.
- Optional actor ID.
- Timestamp.
- Necessary metadata.

## Requirements

- Prevent duplicate event processing.
- Validate events.
- Avoid unnecessary data collection.
- Process events asynchronously where possible.
- Follow data retention rules.
- Do not collect passwords, OTPs, or payment credentials.

Use the existing order lifecycle to identify completed purchases.

Do not count the same purchase repeatedly.

---

# 6. INTERNAL MODEL TRAINING AND EXECUTION

The ML engine must operate within the existing application runtime.

## 6.1 No Dedicated Training Server

Do not require another server for model training.

Use lightweight training and statistical recalculation jobs that execute within the hosting environment.

For shared hosting, training must be divided into bounded tasks.

Do not run long-running model training operations during customer requests.

## 6.2 Training Workflow

1. Retrieve authorized historical data.
2. Validate data completeness.
3. Remove duplicate records.
4. Handle missing values.
5. Generate features.
6. Split training and evaluation datasets appropriately.
7. Train or update the model.
8. Evaluate model performance.
9. Compare against a baseline.
10. Store model parameters or artifacts locally.
11. Record model version.
12. Activate the model only after successful validation.

## 6.3 Scheduled Execution

Use the existing hosting-supported scheduling mechanism.

Possible options:

- Hostinger-supported cron jobs.
- Existing Laravel Scheduler.
- Existing application scheduler.
- Supported queue workers.
- Bounded command-line scripts.

Do not assume persistent background processes are available.

For shared hosting, design scheduled jobs that:

- Execute within allowed time limits.
- Process limited batches.
- Save progress.
- Resume safely.
- Prevent duplicate execution.
- Release resources after completion.

## 6.4 Suggested Initial Schedule

| Operation | Suggested Frequency |
|---|---|
| Recommendation refresh | Daily |
| Demand forecasting | Weekly |
| Customer segmentation | Monthly |
| Purchase prediction updates | Weekly |
| Inventory risk calculation | Daily |
| Sentiment aggregation | Daily |
| Fraud pattern analysis | Daily or as events arrive |
| Product bundling | Weekly |
| Product text index refresh | When products change |
| Image analysis | During permitted upload processing |

Adjust based on actual data volume and hosting limitations.

## 6.5 Local Model Storage

Store lightweight model parameters and artifacts within the application's protected storage directory.

Requirements:

- Prevent public access.
- Validate file permissions.
- Version model artifacts.
- Preserve previous working versions.
- Support rollback.
- Avoid loading unnecessary model files into memory.

Never store model credentials or private information in public directories.

---

# 7. DATABASE DESIGN

Inspect the existing database before adding tables.

Potential new tables:

## ml_events

- id
- event_type
- actor_id
- entity_type
- entity_id
- metadata
- occurred_at
- created_at

## ml_predictions

- id
- model_key
- model_version
- prediction_type
- entity_type
- entity_id
- prediction_value
- prediction_metadata
- generated_at
- expires_at

## ml_model_versions

- id
- model_key
- version
- algorithm
- artifact_reference
- metrics
- training_timestamp
- deployment_status

## ml_training_runs

- id
- model_key
- model_version
- started_at
- completed_at
- status
- evaluation_metrics
- error_summary

## ml_alerts

- id
- alert_type
- entity_type
- entity_id
- severity
- description
- status
- created_at
- resolved_at

These are conceptual structures.

Adapt them to the existing database conventions.

Do not create redundant tables where equivalent functionality already exists.

---

# 8. INTERNAL API DESIGN

Expose ML functionality through the existing backend.

Do not deploy another API server.

Suggested endpoints:

## Recommendations

- GET /api/ml/recommendations
- GET /api/ml/recommendations/similar/{productId}
- POST /api/ml/events

## Forecasting

- GET /api/ml/forecast/products/{productId}
- GET /api/ml/forecast/seller/overview

## Search

- POST /api/ml/search

## Customer Analytics

- GET /api/ml/customers/segments
- GET /api/ml/customers/insights

## Purchase Prediction

- GET /api/ml/purchase-probability/{productId}

## Inventory

- GET /api/ml/inventory/predictions
- GET /api/ml/inventory/alerts

## Sentiment

- POST /api/ml/reviews/analyze
- GET /api/ml/reviews/insights

## Fraud

- POST /api/ml/fraud/evaluate
- GET /api/ml/fraud/alerts

## Bundling

- GET /api/ml/bundles/products/{productId}

## Image Analysis

- POST /api/ml/images/analyze

These routes must follow the existing application's API conventions and must not conflict with existing endpoints.

All endpoints must enforce authentication, authorization, validation, and rate limiting where appropriate.

---

# 9. ML ADMINISTRATION DASHBOARD

Add an ML management section to the existing administrator dashboard.

Do not create another application or administrator portal.

## Overview

Display:

- Active ML modules.
- Latest model updates.
- Model performance.
- Prediction volume.
- Processing errors.
- Last successful training run.
- ML engine availability.

## Model Management

Allow authorized administrators to:

- Enable or disable individual ML modules.
- Inspect model versions.
- View training history.
- View evaluation metrics.
- Trigger supported retraining jobs.
- Inspect failed jobs.
- Roll back to a previous validated model.

## Resource Monitoring

Track:

- ML execution duration.
- Memory usage where measurable.
- CPU consumption where available.
- Database query duration.
- Failed jobs.
- Prediction latency.

Do not introduce a separate monitoring service unless already available.

Use internal logging and the existing hosting tools.

---

# 10. SELLER INTELLIGENCE DASHBOARD

Integrate ML insights into the existing seller dashboard.

## Sections

### Sales Forecast

Display predicted demand based on historical sales.

### Demand Insights

Identify increasing and decreasing product demand.

### Inventory Intelligence

Display stockout estimates and restocking suggestions.

### Customer Insights

Display aggregated customer purchasing behavior.

### Product Performance

Identify products with high engagement but low conversion.

### Review Intelligence

Display customer sentiment and recurring complaints.

### Bundle Suggestions

Identify frequently purchased product combinations.

## Data Isolation

Sellers must only access information belonging to their authorized store and transactions.

Never expose another seller's private analytics.

---

# 11. CUSTOMER EXPERIENCE

Integrate ML features without disrupting the existing design.

## Homepage

- Personalized products.
- Trending products.
- Relevant product discovery.

## Product Details

- Similar products.
- Frequently bought together.
- Personalized recommendations.

## Search

- Semantic matching.
- Relevant search results.
- Existing filters.

## Shopping Cart

- Complementary product recommendations.
- Bundle suggestions.

## Requirements

- Reuse existing components.
- Follow existing typography and design tokens.
- Preserve responsive layouts.
- Preserve accessibility.
- Implement loading states.
- Implement empty states.
- Implement error states.
- Avoid unnecessary visual changes.

Do not introduce an unnecessary chatbot.

Each ML module must provide an actual functional benefit.

---

# 12. HOSTING RESOURCE OPTIMIZATION

This section is mandatory.

The ML system must be designed around the actual limits of the existing Hostinger plan.

## CPU

- Avoid expensive calculations on every request.
- Precompute reusable results.
- Use efficient algorithms.
- Batch processing.
- Limit concurrent ML jobs.

## RAM

- Avoid loading multiple large models simultaneously.
- Use lightweight algorithms.
- Release temporary data after processing.
- Process large datasets in batches.
- Cache only useful results.

## Execution Time

- Avoid long-running HTTP requests.
- Use bounded scheduled jobs.
- Save progress between batches.
- Avoid synchronous training during checkout or browsing.

## Database

- Add appropriate indexes.
- Avoid expensive full-table scans.
- Use pagination.
- Cache frequently requested predictions.
- Avoid duplicate event writes.

## Disk

- Store only necessary model artifacts.
- Remove obsolete temporary files.
- Version models carefully.
- Prevent logs from growing indefinitely.

## Resource Failure

If an ML operation exceeds available resources:

- Stop the affected operation safely.
- Preserve existing application data.
- Record the failure.
- Avoid retry loops.
- Keep ordinary application functionality operational.

Never sacrifice checkout, payments, authentication, or core database operations for ML processing.

---

# 13. SECURITY AND PRIVACY

The ML engine must inherit the existing application's security model.

Required protections:

- Server-side execution only for private ML operations.
- Authentication.
- Role-based authorization.
- Input validation.
- Rate limiting.
- Protected model storage.
- Secure image uploads.
- Data access restrictions.
- Safe logging.
- Retention policies.
- Seller data isolation.

Predictions must never directly:

- Confirm payments.
- Change payment status.
- Modify inventory quantities.
- Approve refunds.
- Change user roles.
- Approve seller verification.
- Execute financial transactions.
- Automatically suspend customers.

Trusted backend business logic must remain authoritative.

---

# 14. FAILURE HANDLING AND FALLBACKS

The ML engine must never become a single point of failure.

| Failure | Required Behavior |
|---|---|
| Recommendation failure | Use existing product listing or popularity-based results |
| Forecast failure | Display historical sales only |
| Semantic search failure | Use existing keyword search |
| Segmentation failure | Use existing analytics or display unavailable state |
| Prediction failure | Omit the prediction |
| Inventory prediction failure | Use existing inventory calculations |
| Sentiment failure | Continue displaying normal reviews |
| Fraud detection failure | Preserve existing payment security |
| Bundling failure | Hide bundle suggestions |
| Image analysis failure | Continue through existing upload validation |

Every failure must be logged appropriately.

Do not expose internal stack traces to customers.

---

# 15. IMPLEMENTATION PHASES

Do not implement all ten modules in a single operation.

Follow these phases.

## PHASE 0 — EXISTING APPLICATION AND HOSTING AUDIT

Inspect:

- Application architecture.
- Backend framework.
- Database.
- Hostinger plan capabilities.
- PHP, Node.js, and Python availability.
- Available RAM.
- CPU limits.
- Execution time.
- Cron support.
- Queue support.
- SSH access.
- Package compatibility.
- Current deployment process.

Produce:

1. Architecture report.
2. Hosting capability report.
3. ML technology compatibility report.
4. Database integration plan.
5. Risk assessment.
6. Phased development plan.

Do not modify application files during the audit.

## PHASE 1 — INTERNAL ML FOUNDATION

Implement:

- Internal ML module structure.
- Feature flags.
- Event collection.
- Prediction storage.
- Internal API routes.
- Protected model storage.
- Background execution.
- Logging.
- Error handling.
- Resource limits.

Deliverable: An operational internal ML foundation that runs within Hostinger.

## PHASE 2 — CUSTOMER PRODUCT INTELLIGENCE

Implement:

- Personalized recommendations.
- Similar products.
- Semantic product search.
- Smart bundling.

Deliverable: ML-enhanced product discovery.

## PHASE 3 — SELLER INTELLIGENCE

Implement:

- Demand forecasting.
- Inventory prediction.
- Customer segmentation.
- Product performance analysis.

Deliverable: Seller intelligence dashboard.

## PHASE 4 — REVIEW AND SECURITY INTELLIGENCE

Implement:

- Sentiment analysis.
- Fraud and anomaly detection.
- Product image quality analysis.
- Optional lightweight product classification.

Deliverable: Additional analytical and moderation capabilities.

## PHASE 5 — OPTIMIZATION

Implement:

- Prediction caching.
- Model evaluation.
- Model versioning.
- Scheduled updates.
- Resource optimization.
- Failure monitoring.
- Rollback mechanisms.

Deliverable: Stable, maintainable, Hostinger-compatible ML infrastructure.

---

# 16. TESTING REQUIREMENTS

## Existing Application Regression Tests

Verify:

- Customer login.
- Seller login.
- Administrator login.
- Product creation.
- Product editing.
- Product browsing.
- Search.
- Cart.
- Checkout.
- Payment processing.
- Order management.
- Inventory.
- Reviews.
- Notifications.
- Role permissions.

## ML Tests

Verify:

- Recommendations.
- Cold-start behavior.
- Demand forecasting.
- Semantic search.
- Customer segmentation.
- Purchase prediction.
- Inventory calculations.
- Sentiment classification.
- Fraud detection.
- Product bundling.
- Image quality analysis.

## Hosting Compatibility Tests

Verify:

- ML modules execute within the existing runtime.
- No external ML service is required.
- No external inference API is called.
- No separate ML server is required.
- Scheduled jobs work within available execution limits.
- Memory usage remains acceptable.
- Database queries remain efficient.
- Model artifacts are stored securely.
- ML failures do not interrupt core application operations.

## Failure Tests

Simulate:

- Missing historical data.
- Invalid input.
- Database failure.
- Model loading failure.
- Scheduled job timeout.
- Insufficient memory.
- Duplicate events.
- Unauthorized ML endpoint access.
- Missing prediction results.

The existing marketplace must remain operational.

---

# 17. ACCEPTANCE CRITERIA

The implementation is complete only when the following conditions are met.

## Hosting

- [ ] Entire ML engine operates within existing Hostinger hosting.
- [ ] No separate ML server.
- [ ] No separate VPS.
- [ ] No external AI APIs.
- [ ] No external inference service.
- [ ] No additional cloud provider.
- [ ] Hosting resource limitations have been verified.

## Architecture

- [ ] Existing application architecture is preserved.
- [ ] ML modules are isolated.
- [ ] Existing backend remains authoritative.
- [ ] Feature flags work.
- [ ] Internal API endpoints are secured.

## Data

- [ ] Real application data is used.
- [ ] No fake production analytics.
- [ ] Events are validated.
- [ ] Duplicate events are handled.
- [ ] Existing database records are preserved.

## ML

- [ ] Recommendations work.
- [ ] Demand forecasting works.
- [ ] Semantic search works.
- [ ] Customer segmentation works.
- [ ] Purchase prediction works.
- [ ] Inventory prediction works.
- [ ] Sentiment analysis works.
- [ ] Fraud detection works.
- [ ] Product bundling works.
- [ ] Image analysis works.

## Reliability

- [ ] ML failures do not break the marketplace.
- [ ] Existing checkout works.
- [ ] Existing payments work.
- [ ] Existing inventory management works.
- [ ] Background tasks respect hosting limitations.
- [ ] Model versions are tracked.
- [ ] Rollback is supported.

## Security

- [ ] ML endpoints require appropriate authorization.
- [ ] Seller data remains isolated.
- [ ] Sensitive data is protected.
- [ ] Model files are not publicly accessible.
- [ ] Predictions cannot override trusted business operations.

---

# 18. FINAL CODING AGENT INSTRUCTIONS

You are modifying an existing production-oriented e-commerce application.

Your responsibility is to integrate the Machine Learning system described in this document without damaging or replacing the existing application.

Follow these mandatory rules:

1. Inspect before modifying.
2. Determine the actual Hostinger hosting capabilities.
3. Use the existing backend runtime.
4. Do not create a separate ML service.
5. Do not require external AI APIs.
6. Do not require another hosting provider.
7. Do not install unnecessary packages.
8. Do not introduce incompatible native dependencies.
9. Never rewrite working application modules unnecessarily.
10. Never perform destructive database migrations.
11. Never fabricate production data.
12. Do not train large models on resource-constrained hosting.
13. Use lightweight algorithms where possible.
14. Process expensive operations asynchronously or through bounded scheduled tasks.
15. Cache reusable predictions.
16. Protect all ML endpoints.
17. Preserve the existing UI and UX.
18. Test all affected workflows.
19. Document every new module, migration, route, configuration, and scheduled task.
20. Keep the existing marketplace fully operational.

## Required Workflow

### Step 1 — Audit

Inspect the entire existing project and hosting compatibility.

### Step 2 — Report

Produce an architecture report, hosting capability report, and implementation plan.

### Step 3 — Wait for Approval

Do not modify application files until the implementation plan is approved.

### Step 4 — Implement Incrementally

Complete one phase at a time.

### Step 5 — Test

Run regression tests and ML-specific tests after each phase.

### Step 6 — Verify

Check database integrity, resource consumption, authorization, error handling, and fallback behavior.

### Step 7 — Document

Provide a clear report of completed work, remaining limitations, and deployment requirements.

If a requested algorithm cannot run efficiently on the available hosting environment, choose a lighter compatible alternative.

If no safe implementation is possible, explain the limitation instead of introducing an external service or silently changing the architecture.

Do not upgrade hosting, change hosting providers, or introduce paid infrastructure without explicit approval.

---

# FINAL PROJECT OBJECTIVE

Deliver a complete, modular, self-hosted Machine Learning intelligence system integrated into the existing e-commerce application.

The system must use the existing Hostinger hosting environment and available server resources.

It must provide intelligent recommendations, predictive analytics, customer insights, inventory intelligence, sentiment analysis, anomaly detection, product bundling, and product image analysis.

The application must remain stable, secure, maintainable, and fully functional.

**ONE APPLICATION. ONE HOSTING ENVIRONMENT. ONE DATABASE ECOSYSTEM. NO EXTERNAL ML SERVICES.**

Machine Learning must enhance the existing e-commerce platform without replacing its architecture or compromising its core business operations.
