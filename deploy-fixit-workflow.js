#!/usr/bin/env node

/**
 * Deploy Fix-It AI Agent Workflow to Dynatrace
 * Uses Automation API to create/update the workflow
 */

const fs = require('fs');
const path = require('path');

// Environment configuration
const DT_ENVIRONMENT = process.env.DT_ENVIRONMENT || 'https://YOUR_TENANT_ID.apps.dynatracelabs.com';
const DT_API_TOKEN = process.env.DT_API_TOKEN || process.env.DT_PLATFORM_TOKEN || process.argv[2];
const BIZOBS_API_URL = process.env.BIZOBS_API_URL || 'http://localhost:8080';
const DT_WORKFLOW_OWNER = process.env.DT_WORKFLOW_OWNER || 'bizobs-automation';

console.log('🚀 Fix-It AI Agent Workflow Deployment\n');
console.log(`📍 Target Environment: ${DT_ENVIRONMENT}`);
console.log(`🔗 BizObs API URL: ${BIZOBS_API_URL}`);
console.log(`👤 Workflow Owner: ${DT_WORKFLOW_OWNER}\n`);

if (!DT_API_TOKEN) {
  console.error('❌ Error: DT_API_TOKEN or DT_PLATFORM_TOKEN not set\n');
  console.error('Set your Dynatrace API token using one of these methods:\n');
  console.error('1. Environment variable:');
  console.error('   export DT_API_TOKEN="dt0c01.***"');
  console.error('   export DT_PLATFORM_TOKEN="dt0s16.***"\n');
  console.error('2. Command line argument:');
  console.error('   node deploy-fixit-workflow.js "dt0c01.***"\n');
  console.error('📝 Your token needs these scopes:');
  console.error('   • WriteWorkflows (workflows.write)');
  console.error('   • ReadWorkflows (workflows.read)');
  console.error('   • DataExport (DataExport)\n');
  console.error('🔗 Get a token from:');
  console.error(`   ${DT_ENVIRONMENT}/ui/apps/dynatrace.classic.tokens/ui/access-tokens`);
  process.exit(1);
}

// Load and process workflow template
const workflowTemplatePath = path.join(__dirname, 'monaco', 'bizobs-automation', 'workflow-fixit-agent.json');

if (!fs.existsSync(workflowTemplatePath)) {
  console.error(`❌ Error: Workflow template not found: ${workflowTemplatePath}`);
  process.exit(1);
}

const templateContent = fs.readFileSync(workflowTemplatePath, 'utf8');

// Simple template variable replacement (Monaco-like)
let workflowConfig = templateContent
  .replace(/\{\{ \.name \}\}/g, 'BizObs Fix-It AI Agent - Autonomous Remediation')
  .replace(/\{\{ \.Env\.DT_WORKFLOW_OWNER \| default "bizobs-automation" \}\}/g, DT_WORKFLOW_OWNER)
  .replace(/\{\{ \.Env\.BIZOBS_API_URL \| default "http:\/\/localhost:8080" \}\}/g, BIZOBS_API_URL)
  .replace(/\{\{ \.Env\.DT_ENVIRONMENT \}\}/g, DT_ENVIRONMENT)
  .replace(/\{\{ \.Env\.DT_API_TOKEN \}\}/g, '{{ _.DT_API_TOKEN }}'); // Keep token reference for runtime

const workflow = JSON.parse(workflowConfig);

console.log('📋 Workflow Details:');
console.log(`   Title: ${workflow.title}`);
console.log(`   Owner: ${workflow.owner}`);
console.log(`   Trigger: Problem Opened (ERROR, SLOWDOWN, RESOURCE)`);
console.log(`   Tasks: ${Object.keys(workflow.tasks).length}\n`);

// Deploy workflow to Dynatrace
async function deployWorkflow() {
  const baseUrl = DT_ENVIRONMENT.replace(/\/+$/, '');
  const apiUrl = `${baseUrl}/api/v2/workflows`;

  console.log('🔍 Checking for existing workflow...');

  try {
    // Check if workflow already exists
    const listResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Api-Token ${DT_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!listResponse.ok) {
      throw new Error(`Failed to list workflows: ${listResponse.status} ${listResponse.statusText}`);
    }

    const existingWorkflows = await listResponse.json();
    const existingWorkflow = existingWorkflows.workflows?.find(w => w.title === workflow.title);

    let workflowId = null;
    let method = 'POST';
    let url = apiUrl;

    if (existingWorkflow) {
      console.log(`   ✅ Found existing workflow: ${existingWorkflow.id}`);
      workflowId = existingWorkflow.id;
      method = 'PUT';
      url = `${apiUrl}/${workflowId}`;
      console.log(`\n🔄 Updating existing workflow...`);
    } else {
      console.log(`   ℹ️  No existing workflow found`);
      console.log(`\n➕ Creating new workflow...`);
    }

    // Deploy the workflow
    const deployResponse = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Api-Token ${DT_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow)
    });

    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      throw new Error(`Deployment failed: ${deployResponse.status} ${deployResponse.statusText}\n${errorText}`);
    }

    const result = await deployResponse.json();
    workflowId = result.id || workflowId;

    console.log('\n✅ Workflow deployed successfully!');
    console.log(`\n📊 Workflow Details:`);
    console.log(`   ID: ${workflowId}`);
    console.log(`   Title: ${workflow.title}`);
    console.log(`   Status: ${method === 'POST' ? 'Created' : 'Updated'}`);
    console.log(`\n🔗 View in Dynatrace:`);
    console.log(`   ${baseUrl}/ui/apps/dynatrace.automations/workflows/${workflowId}`);
    console.log(`\n📋 What happens next:`);
    console.log(`   1. When a problem opens (ERROR, SLOWDOWN, RESOURCE):`);
    console.log(`   2. → Workflow fetches problem details from Dynatrace`);
    console.log(`   3. → Triggers Fix-It AI Agent via webhook`);
    console.log(`   4. → Fix-It diagnoses problem using Ollama + Davis AI`);
    console.log(`   5. → Executes remediation (feature flags, circuit breakers, etc.)`);
    console.log(`   6. → Sends deployment events back to Dynatrace`);
    console.log(`   7. → Timeline shows full remediation history`);
    console.log(`\n🎯 Test the integration:`);
    console.log(`   curl -X POST ${BIZOBS_API_URL}/api/gremlin/inject`);
    console.log(`   (Inject chaos → Problem detected → Workflow triggers → Fix-It remediates)`);
    console.log(`\n✨ Autonomous remediation is now active!`);

  } catch (error) {
    console.error(`\n❌ Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

deployWorkflow();
