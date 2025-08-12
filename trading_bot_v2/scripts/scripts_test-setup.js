const { ethers } = require('ethers');
require('dotenv').config();

// Test configuration and connections
async function testSetup() {
    console.log('🧪 TESTING ARBITRAGE BOT SETUP\n');
    
    let allTestsPassed = true;
    
    // Test 1: Environment Variables
    console.log('1️⃣  Testing Environment Variables...');
    const requiredEnvVars = ['RPC_URL'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.log('❌ Missing required environment variables:', missingVars.join(', '));
        allTestsPassed = false;
    } else {
        console.log('✅ All required environment variables found');
    }
    
    // Test 2: RPC Connection
    console.log('\n2️⃣  Testing RPC Connection...');
    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const network = await provider.getNetwork();
        const blockNumber = await provider.getBlockNumber();
        
        console.log(`✅ Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
        console.log(`✅ Current block number: ${blockNumber}`);
        
        // Verify it's Polygon
        if (network.chainId !== 137n) {
            console.log('⚠️  Warning: Connected to network other than Polygon mainnet');
        }
        
    } catch (error) {
        console.log('❌ RPC connection failed:', error.message);
        allTestsPassed = false;
    }
    
    // Test 3: Token Addresses
    console.log('\n3️⃣  Testing Token Addresses...');
    try {
        const WETH = ethers.getAddress('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619');
        const USDC = ethers.getAddress('0x2791bca1f2de4661ed88a30c99a7a9449aa84174');
        
        console.log(`✅ WETH address (checksummed): ${WETH}`);
        console.log(`✅ USDC address (checksummed): ${USDC}`);
        
    } catch (error) {
        console.log('❌ Token address validation failed:', error.message);
        allTestsPassed = false;
    }
    
    // Test 4: Pair Contract Calls
    console.log('\n4️⃣  Testing DEX Pair Contracts...');
    
    const exchanges = {
        'Uniswap': '0xdE32C9ebdd5f587E0F677d5AdCac593ecFfFD91A', //'0x85C31FFA3706d1cce9d525a00f1C7D4A2911754c',
        'Sushiswap': '0x34965ba0ac2451A34a0471F04CCa3F990b8dea27',
        'Quickswap': '0x853Ee4b2A13f8a742d64C8F088bE7bA2131f670d'
    };
    
    const pairABI = [
        "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)",
        "function token0() view returns (address)",
        "function token1() view returns (address)"
    ];
    
    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        
        for (const [exchangeName, pairAddress] of Object.entries(exchanges)) {
            try {
                const checksummedAddress = ethers.getAddress(pairAddress);
                const pair = new ethers.Contract(checksummedAddress, pairABI, provider);
                
                const [token0, token1, reserves] = await Promise.all([
                    pair.token0(),
                    pair.token1(), 
                    pair.getReserves()
                ]);
                
                console.log(`✅ ${exchangeName}: Contract responsive`);
                console.log(`   Token0: ${token0}`);
                console.log(`   Token1: ${token1}`);
                console.log(`   Reserve0: ${reserves[0].toString()}`);
                console.log(`   Reserve1: ${reserves[1].toString()}`);
                
            } catch (error) {
                console.log(`❌ ${exchangeName}: Contract call failed - ${error.message}`);
                allTestsPassed = false;
            }
        }
        
    } catch (error) {
        console.log('❌ Pair contract testing failed:', error.message);
        allTestsPassed = false;
    }
    
    // Test 5: Database Connection
    console.log('\n5️⃣  Testing Database Connection...');
    try {
        const Database = require('../src/db');
        
        // Test database operations
        await Database.setConfig('test_key', 'test_value', 'Test configuration');
        const testValue = await Database.getConfig('test_key');
        
        if (testValue === 'test_value') {
            console.log('✅ Database read/write operations working');
        } else {
            console.log('❌ Database operations failed');
            allTestsPassed = false;
        }
        
        Database.close();
        
    } catch (error) {
        console.log('❌ Database connection failed:', error.message);
        allTestsPassed = false;
    }
    
    // Test 6: Port Availability
    console.log('\n6️⃣  Testing Port Availability...');
    const port = process.env.PORT || 3000;
    
    try {
        const net = require('net');
        const server = net.createServer();
        
        await new Promise((resolve, reject) => {
            server.listen(port, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        server.close();
        console.log(`✅ Port ${port} is available`);
        
    } catch (error) {
        console.log(`❌ Port ${port} is not available:`, error.message);
        allTestsPassed = false;
    }
    
    // Test Results Summary
    console.log('\n' + '='.repeat(50));
    if (allTestsPassed) {
        console.log('🎉 ALL TESTS PASSED!');
        console.log('✅ Your arbitrage bot is ready to run');
        console.log('🚀 Start with: npm start');
    } else {
        console.log('❌ SOME TESTS FAILED');
        console.log('🔧 Please fix the issues above before running the bot');
    }
    console.log('='.repeat(50));
}

if (require.main === module) {
    testSetup().catch(error => {
        console.error('❌ Test setup failed:', error);
        process.exit(1);
    });
}

module.exports = { testSetup };