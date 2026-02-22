// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BurnRegistry
 * @notice Records token burns that occurred on XRPL L1 for transparency and auditability.
 *        Each burn is stored on-chain on XRPL EVM so anyone can verify burn history.
 */
contract BurnRegistry {
    struct BurnRecord {
        bytes32 xrplTxHash;
        uint256 amountWei;
        string tokenSymbol;
        uint256 recordedAt;
        address recordedBy;
    }

    BurnRecord[] private _burns;
    mapping(bytes32 => bool) private _recordedTx;

    event BurnRecorded(
        bytes32 indexed xrplTxHash,
        uint256 amountWei,
        string tokenSymbol,
        uint256 recordedAt,
        address indexed recordedBy
    );

    /// @notice Record a burn that occurred on XRPL L1 (permissionless: anyone can submit)
    /// @param xrplTxHash The XRPL L1 transaction hash of the burn (Payment to issuer)
    /// @param amountWei Amount burned, in token's smallest unit (e.g. 1e6 for 1 token with 6 decimals)
    /// @param tokenSymbol Token symbol (e.g. "GGK")
    function recordBurn(
        bytes32 xrplTxHash,
        uint256 amountWei,
        string calldata tokenSymbol
    ) external {
        require(xrplTxHash != bytes32(0), "BurnRegistry: zero tx hash");
        require(amountWei > 0, "BurnRegistry: zero amount");
        require(!_recordedTx[xrplTxHash], "BurnRegistry: already recorded");

        _recordedTx[xrplTxHash] = true;
        _burns.push(
            BurnRecord({
                xrplTxHash: xrplTxHash,
                amountWei: amountWei,
                tokenSymbol: tokenSymbol,
                recordedAt: block.timestamp,
                recordedBy: msg.sender
            })
        );

        emit BurnRecorded(xrplTxHash, amountWei, tokenSymbol, block.timestamp, msg.sender);
    }

    /// @notice Check if an XRPL tx hash has already been recorded
    function isRecorded(bytes32 xrplTxHash) external view returns (bool) {
        return _recordedTx[xrplTxHash];
    }

    /// @notice Total number of burns recorded
    function burnCount() external view returns (uint256) {
        return _burns.length;
    }

    /// @notice Get a burn record by index
    function getBurn(uint256 index) external view returns (
        bytes32 xrplTxHash,
        uint256 amountWei,
        string memory tokenSymbol,
        uint256 recordedAt,
        address recordedBy
    ) {
        require(index < _burns.length, "BurnRegistry: index out of range");
        BurnRecord storage r = _burns[index];
        return (r.xrplTxHash, r.amountWei, r.tokenSymbol, r.recordedAt, r.recordedBy);
    }
}
