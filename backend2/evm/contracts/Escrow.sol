// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {
    address public platform;

    struct Payment {
        address buyer;
        address seller;
        uint256 remaining; // wei
        uint256 pricePerCall; // wei per call
        bool active;
    }

    // key by keccak256(abi.encodePacked(buyer, listingId))
    mapping(bytes32 => Payment) public payments;

    modifier onlyPlatform() {
        require(msg.sender == platform, "Only platform");
        _;
    }

    constructor(address _platform) {
        platform = _platform;
    }

    function _key(address buyer, bytes32 listingId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(buyer, listingId));
    }

    // Buyer deposits funds for a listing. pricePerCall is in wei per call.
    function deposit(bytes32 listingId, address seller, uint256 pricePerCall) external payable {
        require(msg.value > 0, "Must send ETH");
        bytes32 k = _key(msg.sender, listingId);
        Payment storage p = payments[k];
        require(!p.active, "Payment already active");
        p.buyer = msg.sender;
        p.seller = seller;
        p.remaining = msg.value;
        p.pricePerCall = pricePerCall;
        p.active = true;
    }

    // Platform releases funds to the seller based on reported calls.
    function releaseUsage(address buyer, bytes32 listingId, uint256 calls) external onlyPlatform returns (uint256) {
        bytes32 k = _key(buyer, listingId);
        Payment storage p = payments[k];
        require(p.active, "No active payment");
        require(calls > 0, "No calls");

        uint256 amount = calls * p.pricePerCall;
        if (amount > p.remaining) {
            amount = p.remaining;
        }
        require(amount > 0, "Nothing to release");

        p.remaining -= amount;
        if (p.remaining == 0) {
            p.active = false;
        }

        (bool ok, ) = p.seller.call{value: amount}("");
        require(ok, "Transfer failed");

        return amount;
    }

    // Buyer or platform can trigger refund of remaining balance back to buyer
    function refund(bytes32 listingId) external returns (uint256) {
        bytes32 k = _key(msg.sender, listingId);
        Payment storage p = payments[k];
        require(p.active, "No active payment");

        uint256 amt = p.remaining;
        p.remaining = 0;
        p.active = false;

        (bool ok, ) = p.buyer.call{value: amt}("");
        require(ok, "Refund failed");
        return amt;
    }

    // Admin refund (platform) for an arbitrary buyer
    function adminRefund(address buyer, bytes32 listingId) external onlyPlatform returns (uint256) {
        bytes32 k = _key(buyer, listingId);
        Payment storage p = payments[k];
        require(p.active, "No active payment");

        uint256 amt = p.remaining;
        p.remaining = 0;
        p.active = false;

        (bool ok, ) = p.buyer.call{value: amt}("");
        require(ok, "Refund failed");
        return amt;
    }

    // helper to check payment
    function getPayment(address buyer, bytes32 listingId) external view returns (address, address, uint256, uint256, bool) {
        bytes32 k = _key(buyer, listingId);
        Payment storage p = payments[k];
        return (p.buyer, p.seller, p.remaining, p.pricePerCall, p.active);
    }
}
