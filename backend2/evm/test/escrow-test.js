const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Escrow (EVM — XRP as native token)", function () {
  let escrow;
  let deployer, buyer, seller, other;

  beforeEach(async function () {
    [deployer, buyer, seller, other] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("Escrow");
    escrow = await Escrow.deploy(deployer.address);
    await escrow.waitForDeployment();
  });

  it("deposit -> release usage -> refund full lifecycle", async function () {
    const listingId = ethers.encodeBytes32String("listing-1");

    // buyer deposits 1 XRP with pricePerCall = 0.1 XRP
    const pricePerCall = ethers.parseEther("0.1");
    const depositAmount = ethers.parseEther("1.0");

    await escrow.connect(buyer).deposit(listingId, seller.address, pricePerCall, { value: depositAmount });

    // verify stored payment
    const p = await escrow.getPayment(buyer.address, listingId);
    expect(p[2]).to.equal(depositAmount); // remaining
    expect(p[3]).to.equal(pricePerCall);
    expect(p[4]).to.equal(true);

    // capture seller balance before release
    const sellerBalBefore = await ethers.provider.getBalance(seller.address);

    // platform (deployer) releases for 3 calls -> 0.3 XRP to seller
    await escrow.connect(deployer).releaseUsage(buyer.address, listingId, 3);

    const released = ethers.parseEther("0.3");
    const sellerBalAfter = await ethers.provider.getBalance(seller.address);
    expect(sellerBalAfter - sellerBalBefore).to.equal(released);

    // remaining should be 0.7 XRP
    const p2 = await escrow.getPayment(buyer.address, listingId);
    expect(p2[2]).to.equal(ethers.parseEther("0.7"));

    // platform releases more than remaining -> caps to 0.7 XRP
    await escrow.connect(deployer).releaseUsage(buyer.address, listingId, 10);
    const p3 = await escrow.getPayment(buyer.address, listingId);
    expect(p3[2]).to.equal(0n);
    expect(p3[4]).to.equal(false); // payment exhausted

    // buyer cannot refund (no active payment)
    await expect(escrow.connect(buyer).refund(listingId)).to.be.revertedWith("No active payment");

    // ── new deposit for refund test ──
    await escrow.connect(buyer).deposit(listingId, seller.address, pricePerCall, { value: depositAmount });

    const buyerBalBefore = await ethers.provider.getBalance(buyer.address);
    const refundTx = await escrow.connect(buyer).refund(listingId);
    await refundTx.wait();
    const buyerBalAfter = await ethers.provider.getBalance(buyer.address);

    // buyer gets ~1 XRP back (minus gas)
    expect(buyerBalAfter).to.be.greaterThan(buyerBalBefore - ethers.parseEther("0.01"));
  });

  it("only platform can release usage", async function () {
    const listingId = ethers.encodeBytes32String("listing-2");
    const pricePerCall = ethers.parseEther("0.05");

    await escrow.connect(buyer).deposit(listingId, seller.address, pricePerCall, { value: ethers.parseEther("1.0") });

    // random user tries to release -> should revert
    await expect(
      escrow.connect(other).releaseUsage(buyer.address, listingId, 5)
    ).to.be.revertedWith("Only platform");
  });

  it("admin refund works", async function () {
    const listingId = ethers.encodeBytes32String("listing-3");
    const pricePerCall = ethers.parseEther("0.1");
    const depositAmount = ethers.parseEther("2.0");

    await escrow.connect(buyer).deposit(listingId, seller.address, pricePerCall, { value: depositAmount });

    const buyerBalBefore = await ethers.provider.getBalance(buyer.address);

    // platform does admin refund
    await escrow.connect(deployer).adminRefund(buyer.address, listingId);

    const buyerBalAfter = await ethers.provider.getBalance(buyer.address);
    expect(buyerBalAfter - buyerBalBefore).to.equal(depositAmount);

    // payment should be inactive
    const p = await escrow.getPayment(buyer.address, listingId);
    expect(p[4]).to.equal(false);
  });
});
